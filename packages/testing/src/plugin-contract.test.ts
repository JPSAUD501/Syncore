import "fake-indexeddb/auto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFunctionReference,
  defineSchema,
  defineTable,
  query,
  SyncoreRuntime,
  v,
  type QueryCtx,
  type SyncoreCapabilities,
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
      platformProvided: v.string()
    }),
    handler: async (ctx: QueryCtx<typeof schema>) => {
      const capabilities = ctx.capabilities as Record<string, string>;
      return {
        platformProvided: capabilities.platformProvided
      };
    }
  })
};

const readCapabilitiesReference = createFunctionReference<
  "query",
  Record<never, never>,
  {
    platformProvided: string;
  }
>("query", "tasks/readCapabilities");

type PluginTestSchema = typeof schema;
type RuntimeFactory = {
  label: "node" | "web";
  createRuntime(options?: {
    capabilities?: SyncoreCapabilities;
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

      it("exposes runtime capabilities inside function contexts", async () => {
        const runtime = await getFactory().createRuntime({
          capabilities: {
            platformProvided: `${label}-platform`
          }
        });

        await runtime.start();
        try {
          await expect(
            runtime.createClient().query(readCapabilitiesReference)
          ).resolves.toEqual({
            platformProvided: `${label}-platform`
          });
        } finally {
          await runtime.stop();
        }
      });
    });
  }
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
        ...(options?.capabilities ? { capabilities: options.capabilities } : {})
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
        ...(options?.capabilities ? { capabilities: options.capabilities } : {})
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
