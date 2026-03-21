import "fake-indexeddb/auto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type CapabilityDescriptor,
  createFunctionReference,
  defineSchema,
  defineTable,
  query,
  SyncoreRuntime,
  v,
  type QueryCtx,
  type SyncoreCapabilities,
  type SyncoreExperimentalPlugin,
  type SyncoreRuntimeOptions
} from "@syncore/core";
import {
  createNodeSyncoreRuntime,
  NodeFileStorageAdapter,
  NodeSqliteDriver
} from "@syncore/platform-node";
import { createWebSyncoreRuntime } from "@syncore/platform-web";

const wasmFilePath = path.resolve(
  process.cwd(),
  "node_modules/sql.js/dist/sql-wasm.wasm"
);

const schema = defineSchema({
  tasks: defineTable({
    title: v.string()
  })
});

const functions = {
  "tasks/readCapabilities": query({
    args: {},
    returns: v.object({
      platformProvided: v.string(),
      pluginOnly: v.string()
    }),
    handler: async (ctx: QueryCtx<typeof schema>) => {
      const capabilities = ctx.capabilities as Record<string, string>;
      return {
        platformProvided: capabilities.platformProvided,
        pluginOnly: capabilities.pluginOnly
      };
    }
  })
};

const readCapabilitiesReference = createFunctionReference<
  "query",
  Record<never, never>,
  {
    platformProvided: string;
    pluginOnly: string;
  }
>("query", "tasks/readCapabilities");

type PluginTestSchema = typeof schema;
type RuntimeFactory = {
  label: "node" | "web";
  createRuntime(options?: {
    capabilities?: SyncoreCapabilities;
    experimentalPlugins?: Array<SyncoreExperimentalPlugin<PluginTestSchema>>;
  }): Promise<SyncoreRuntime<PluginTestSchema>>;
  dispose(): Promise<void>;
};

describe("plugin contracts", () => {
  const factories: RuntimeFactory[] = [];

  beforeEach(async () => {
    factories.push(await createNodeFactory());
    factories.push(createWebFactory());
  });

  afterEach(async () => {
    while (factories.length > 0) {
      await factories.pop()?.dispose();
    }
  });

  for (const label of ["node", "web"] as const) {
    describe(label, () => {
      const getFactory = () => {
        const factory = factories.find((entry) => entry.label === label);
        if (!factory) {
          throw new Error(`Missing plugin test factory for ${label}.`);
        }
        return factory;
      };

      it("merges runtime and plugin capabilities into function contexts", async () => {
        const plugin: SyncoreExperimentalPlugin<PluginTestSchema> = {
          name: `${label}-capabilities`,
          capabilities: {
            pluginOnly: `${label}-plugin`
          }
        };

        const runtime = await getFactory().createRuntime({
          capabilities: {
            platformProvided: `${label}-platform`
          },
          experimentalPlugins: [plugin]
        });

        await runtime.start();
        try {
          await expect(
            runtime.createClient().query(readCapabilitiesReference)
          ).resolves.toEqual({
            platformProvided: `${label}-platform`,
            pluginOnly: `${label}-plugin`
          });
        } finally {
          await runtime.stop();
        }
      });

      it("runs plugin lifecycle hooks on start and stop", async () => {
        const lifecycleEvents: string[] = [];
        const plugin: SyncoreExperimentalPlugin<PluginTestSchema> = {
          name: `${label}-lifecycle`,
          onStart() {
            lifecycleEvents.push("start");
          },
          onStop() {
            lifecycleEvents.push("stop");
          }
        };

        const runtime = await getFactory().createRuntime({
          experimentalPlugins: [plugin]
        });

        await runtime.start();
        await runtime.stop();

        expect(lifecycleEvents).toEqual(["start", "stop"]);
      });

      it("fails fast when a plugin throws during startup", async () => {
        const runtime = await getFactory().createRuntime({
          experimentalPlugins: [
            {
              name: `${label}-start-failure`,
              onStart() {
                throw new Error(`${label} plugin start failed`);
              }
            }
          ]
        });

        await expect(runtime.start()).rejects.toThrow(
          `${label} plugin start failed`
        );
        await runtime.stop().catch(() => undefined);
      });

      it("fails explicitly when a plugin throws during shutdown", async () => {
        const runtime = await getFactory().createRuntime({
          experimentalPlugins: [
            {
              name: `${label}-stop-failure`,
              onStop() {
                throw new Error(`${label} plugin stop failed`);
              }
            }
          ]
        });

        await runtime.start();
        await expect(runtime.stop()).rejects.toThrow(
          `${label} plugin stop failed`
        );
        await runtime.stop().catch(() => undefined);
      });
    });
  }

  it("deduplicates and sorts capability descriptors before exposing them to plugins", async () => {
    const rootDirectory = await mkdtemp(
      path.join(os.tmpdir(), "syncore-plugin-descriptors-")
    );
    const databasePath = path.join(rootDirectory, "syncore.db");
    const storageDirectory = path.join(rootDirectory, "storage");
    const observedDescriptors: CapabilityDescriptor[][] = [];

    const duplicateDescriptor = {
      name: "syncore.descriptor.duplicate",
      version: 1
    } satisfies CapabilityDescriptor;
    const alphaDescriptor = {
      name: "syncore.descriptor.alpha",
      version: 1
    } satisfies CapabilityDescriptor;
    const zetaDescriptor = {
      name: "syncore.descriptor.zeta",
      version: 2
    } satisfies CapabilityDescriptor;

    const runtime = new SyncoreRuntime<PluginTestSchema>({
      schema,
      functions,
      driver: new NodeSqliteDriver(databasePath),
      storage: new NodeFileStorageAdapter(storageDirectory),
      capabilityDescriptors: [duplicateDescriptor, zetaDescriptor],
      experimentalPlugins: [
        {
          name: "capture-descriptors",
          capabilityDescriptors: [duplicateDescriptor, alphaDescriptor],
          onStart(context) {
            observedDescriptors.push([...context.capabilityDescriptors]);
          }
        }
      ]
    } satisfies SyncoreRuntimeOptions<PluginTestSchema>);

    try {
      await runtime.start();
      expect(observedDescriptors).toHaveLength(1);
      expect(observedDescriptors[0]).toEqual([
        alphaDescriptor,
        duplicateDescriptor,
        zetaDescriptor
      ]);
    } finally {
      await runtime.stop().catch(() => undefined);
      await rm(rootDirectory, { recursive: true, force: true });
    }
  });
});

async function createNodeFactory(): Promise<RuntimeFactory> {
  const rootDirectory = await mkdtemp(
    path.join(os.tmpdir(), "syncore-plugin-node-")
  );
  const databasePath = path.join(rootDirectory, "syncore.db");
  const storageDirectory = path.join(rootDirectory, "storage");

  return {
    label: "node",
    async createRuntime(options) {
      return createNodeSyncoreRuntime({
        databasePath,
        storageDirectory,
        schema,
        functions,
        platform: "plugin-contract-node",
        ...(options?.capabilities ? { capabilities: options.capabilities } : {}),
        ...(options?.experimentalPlugins
          ? { experimentalPlugins: options.experimentalPlugins }
          : {})
      });
    },
    async dispose() {
      await rm(rootDirectory, { recursive: true, force: true });
    }
  };
}

function createWebFactory(): RuntimeFactory {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const databaseName = `syncore-plugin-web-${suffix}`;
  const persistenceDatabaseName = `syncore-plugin-web-idb-${suffix}`;

  return {
    label: "web",
    async createRuntime(options) {
      return createWebSyncoreRuntime({
        databaseName,
        persistenceDatabaseName,
        schema,
        functions,
        persistenceMode: "indexeddb",
        locateFile: () => wasmFilePath,
        platform: "plugin-contract-web",
        ...(options?.capabilities ? { capabilities: options.capabilities } : {}),
        ...(options?.experimentalPlugins
          ? { experimentalPlugins: options.experimentalPlugins }
          : {})
      });
    },
    async dispose() {
      await deleteIndexedDbDatabase(databaseName);
      await deleteIndexedDbDatabase(persistenceDatabaseName);
    }
  };
}

async function deleteIndexedDbDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error ?? new Error(`Failed to delete IndexedDB database ${name}`)
      );
    request.onblocked = () => resolve();
  });
}
