import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  SchedulerJob,
  SyncoreDevtoolsEvent
} from "@syncore/devtools-protocol";
import { defineSchema, defineTable, s } from "../../../schema/src/index.js";
import { cronJobs, mutation, query } from "./functions.js";
import {
  createFunctionReference,
  type ImpactScope,
  type SyncoreExternalChangeApplier,
  type SyncoreExternalChangeEvent,
  type SyncoreExternalChangeSignal,
  type QueryCtx,
  type MutationCtx,
  type StorageObject,
  type StorageWriteInput,
  SyncoreRuntime,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter
} from "./runtime.js";
import {
  createDevtoolsCommandHandler,
  createDevtoolsSubscriptionHost
} from "./devtools.js";

class TestSqliteDriver implements SyncoreSqlDriver {
  private readonly database: DatabaseSync;
  private transactionDepth = 0;
  readonly filename: string;

  constructor(filename: string) {
    this.filename = filename;
    this.database = new DatabaseSync(filename);
  }

  async exec(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async run(
    sql: string,
    params: unknown[] = []
  ): Promise<{ changes: number; lastInsertRowid?: number | string }> {
    const result = this.database
      .prepare(sql)
      .run(...(params as SQLInputValue[]));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid
    };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return this.database.prepare(sql).get(...(params as SQLInputValue[])) as
      | T
      | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.database
      .prepare(sql)
      .all(...(params as SQLInputValue[])) as T[];
  }

  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    if (this.transactionDepth > 0) {
      return this.withSavepoint(`nested_${this.transactionDepth}`, callback);
    }
    this.transactionDepth += 1;
    this.database.exec("BEGIN");
    try {
      const result = await callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async withSavepoint<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const safeName = name.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    this.database.exec(`SAVEPOINT ${safeName}`);
    try {
      const result = await callback();
      this.database.exec(`RELEASE SAVEPOINT ${safeName}`);
      return result;
    } catch (error) {
      this.database.exec(`ROLLBACK TO SAVEPOINT ${safeName}`);
      this.database.exec(`RELEASE SAVEPOINT ${safeName}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.database.close();
  }
}

class TestStorageAdapter implements SyncoreStorageAdapter {
  constructor(private readonly directory: string) {}

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    await mkdir(this.directory, { recursive: true });
    const filePath = path.join(this.directory, id);
    const data =
      typeof input.data === "string"
        ? Buffer.from(input.data)
        : input.data instanceof Uint8Array
          ? input.data
          : new Uint8Array(input.data);
    await writeFile(filePath, data);
    return {
      id,
      path: filePath,
      size: data.byteLength,
      contentType: input.contentType ?? null
    };
  }

  async get(id: string): Promise<StorageObject | null> {
    const filePath = path.join(this.directory, id);
    try {
      const info = await stat(filePath);
      return {
        id,
        path: filePath,
        size: info.size,
        contentType: null
      };
    } catch {
      return null;
    }
  }

  async read(id: string): Promise<Uint8Array | null> {
    try {
      return await readFile(path.join(this.directory, id));
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    await rm(path.join(this.directory, id), { force: true });
  }

  async list(): Promise<StorageObject[]> {
    try {
      const entries = await readdir(this.directory);
      return Promise.all(
        entries.map(async (id) => {
          const filePath = path.join(this.directory, id);
          const info = await stat(filePath);
          return {
            id,
            path: filePath,
            size: info.size,
            contentType: null
          };
        })
      );
    } catch {
      return [];
    }
  }
}

class InterruptingStorageAdapter extends TestStorageAdapter {
  override async put(
    id: string,
    input: StorageWriteInput
  ): Promise<StorageObject> {
    const object = await super.put(id, input);
    throw new Error(`Simulated crash after writing ${object.id}`);
  }
}

class TestExternalChangeSignal implements SyncoreExternalChangeSignal {
  readonly publishedEvents: SyncoreExternalChangeEvent[] = [];
  private readonly listeners = new Set<
    (event: SyncoreExternalChangeEvent) => void
  >();

  subscribe(listener: (event: SyncoreExternalChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: SyncoreExternalChangeEvent): void {
    this.publishedEvents.push(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

class TestExternalChangeApplier implements SyncoreExternalChangeApplier {
  readonly appliedEvents: SyncoreExternalChangeEvent[] = [];

  async applyExternalChange(event: SyncoreExternalChangeEvent) {
    this.appliedEvents.push(event);
    return {
      databaseChanged: event.scope === "database" || event.scope === "all",
      storageChanged: event.scope === "storage" || event.scope === "all",
      changedScopes:
        event.changedScopes ??
        ([
          ...(event.changedTables ?? []).map(
            (tableName) => `table:${tableName}`
          ),
          ...(event.storageIds ?? []).map((storageId) => `storage:${storageId}`)
        ] as ImpactScope[])
    };
  }
}

class TrackingStorageAdapter extends TestStorageAdapter {
  readonly deletedIds: string[] = [];

  override async delete(id: string): Promise<void> {
    this.deletedIds.push(id);
    await super.delete(id);
  }
}

describe("SyncoreRuntime schema + scheduler", () => {
  let rootDirectory: string;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(os.tmpdir(), "syncore-core-"));
  });

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true });
  });

  it("exposes runtime storage capabilities through status", async () => {
    const databasePath = path.join(rootDirectory, "status-capabilities.db");
    const storagePath = path.join(rootDirectory, "status-capabilities-storage");
    const runtime = new SyncoreRuntime({
      schema: defineSchema({}),
      functions: {},
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      runtimeCapabilities: {
        storage: {
          available: true,
          protocol: "file",
          supportsRange: false
        }
      }
    });

    await runtime.start();
    try {
      expect(
        runtime.createClient().watchRuntimeStatus().localQueryResult()
          ?.capabilities?.storage
      ).toEqual({
        available: true,
        protocol: "file",
        supportsRange: false
      });
    } finally {
      await runtime.stop();
    }
  });

  it("fails fast when destructive schema changes are detected", async () => {
    const databasePath = path.join(rootDirectory, "syncore.db");
    const storagePath = path.join(rootDirectory, "storage");
    const functions = {
      "tasks/list": query({
        args: {},
        returns: s.array(s.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      })
    };

    const firstRuntime = new SyncoreRuntime({
      schema: defineSchema({
        tasks: defineTable({
          text: s.string(),
          done: s.boolean()
        }).index("by_done", ["done"])
      }),
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });

    await firstRuntime.start();
    await firstRuntime.stop();

    const secondRuntime = new SyncoreRuntime({
      schema: defineSchema({
        tasks: defineTable({
          text: s.string(),
          done: s.boolean()
        })
      }),
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });

    await expect(secondRuntime.start()).rejects.toThrow(
      /requires a manual migration/i
    );
    await secondRuntime.stop();
  });

  it("runs scheduled mutations and reconciles local state", async () => {
    const databasePath = path.join(rootDirectory, "scheduled.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        returns: s.array(s.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      }),
      "tasks/create": mutation({
        args: { text: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "tasks/scheduleCreate": mutation({
        args: { text: s.string(), delayMs: s.number() },
        returns: s.null(),
        handler: async (ctx, args) => {
          const typedCtx = ctx as MutationCtx;
          const typedArgs = args as { text: string; delayMs: number };
          await typedCtx.scheduler.runAfter(
            typedArgs.delayMs,
            createFunctionReference<"mutation", { text: string }, string>(
              "mutation",
              "tasks/create"
            ),
            { text: typedArgs.text }
          );
          return null;
        }
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      scheduler: {
        pollIntervalMs: 10
      }
    });

    await runtime.start();
    await runtime
      .createClient()
      .mutation(
        createFunctionReference<"mutation", { text: string }, string>(
          "mutation",
          "tasks/create"
        ),
        { text: "Immediate" }
      );
    runtime
      .createClient()
      .watchQuery(
        createFunctionReference<
          "query",
          Record<never, never>,
          Array<{ text: string }>
        >("query", "tasks/list")
      );
    await runtime
      .createClient()
      .mutation(
        createFunctionReference<
          "mutation",
          { text: string; delayMs: number },
          null
        >("mutation", "tasks/scheduleCreate"),
        { text: "From schedule", delayMs: 5 }
      );

    await new Promise((resolve) => setTimeout(resolve, 60));

    const result = await runtime
      .createClient()
      .query(
        createFunctionReference<
          "query",
          Record<never, never>,
          Array<{ text: string }>
        >("query", "tasks/list")
      );
    expect(result.map((item) => item.text).sort()).toEqual([
      "From schedule",
      "Immediate"
    ]);

    await runtime.stop();
  });

  it("injects runtime capabilities into function contexts", async () => {
    const databasePath = path.join(rootDirectory, "capabilities.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
    });

    const runtime = new SyncoreRuntime({
      schema,
      functions: {
        "tasks/readCapabilities": query({
          args: {},
          returns: s.object({
            platformProvided: s.string()
          }),
          handler: async (ctx) => {
            const capabilities = (ctx as QueryCtx).capabilities as Record<
              string,
              string
            >;
            return {
              platformProvided: capabilities.platformProvided
            };
          }
        })
      },
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      capabilities: {
        platformProvided: "node"
      }
    });

    await runtime.start();

    const result = await runtime.createClient().query(
      createFunctionReference<
        "query",
        Record<never, never>,
        {
          platformProvided: string;
        }
      >("query", "tasks/readCapabilities")
    );

    expect(result).toEqual({
      platformProvided: "node"
    });

    await runtime.stop();
  });

  it("publishes external change events for database and storage writes", async () => {
    const databasePath = path.join(rootDirectory, "external-events.db");
    const storagePath = path.join(rootDirectory, "storage");
    const signal = new TestExternalChangeSignal();
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      }),
      files: defineTable({
        label: s.string()
      })
    });

    const functions = {
      "tasks/create": mutation({
        args: { text: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "files/write": mutation({
        args: {
          label: s.string(),
          body: s.string()
        },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).storage.put({
            fileName: `${(args as { label: string }).label}.txt`,
            contentType: "text/plain",
            data: (args as { body: string }).body
          })
      }),
      "files/remove": mutation({
        args: { id: s.string() },
        returns: s.null(),
        handler: async (ctx, args) => {
          await (ctx as MutationCtx).storage.delete(
            (args as { id: string }).id
          );
          return null;
        }
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      externalChangeSignal: signal
    });

    await runtime.start();
    const client = runtime.createClient();

    await client.mutation(
      createFunctionReference<"mutation", { text: string }, string>(
        "mutation",
        "tasks/create"
      ),
      { text: "hello" }
    );

    const fileId = await client.mutation(
      createFunctionReference<
        "mutation",
        { label: string; body: string },
        string
      >("mutation", "files/write"),
      { label: "note", body: "body" }
    );

    await client.mutation(
      createFunctionReference<"mutation", { id: string }, null>(
        "mutation",
        "files/remove"
      ),
      { id: fileId }
    );

    await runtime.stop();

    expect(signal.publishedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "database",
          reason: "commit",
          changedTables: ["tasks"]
        }),
        expect.objectContaining({
          scope: "storage",
          reason: "storage-put",
          storageIds: [fileId],
          changedScopes: ["storage.objects", `storage:${fileId}`]
        }),
        expect.objectContaining({
          scope: "storage",
          reason: "storage-delete",
          storageIds: [fileId],
          changedScopes: ["storage.objects", `storage:${fileId}`]
        })
      ])
    );
  });

  it("invalidates storage object lists after receiving an external storage change", async () => {
    const databasePath = path.join(rootDirectory, "external-storage.db");
    const storagePath = path.join(rootDirectory, "storage");
    const signal = new TestExternalChangeSignal();
    const schema = defineSchema({
      files: defineTable({
        title: s.string()
      })
    });

    const runtime = new SyncoreRuntime({
      schema,
      functions: {},
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      externalChangeSignal: signal
    });

    await runtime.start();
    const devtoolsInvalidationScopes: string[][] = [];
    const unsubscribeDevtoolsInvalidations = runtime
      .getAdmin()
      .subscribeToDevtoolsInvalidations((scopes) => {
        devtoolsInvalidationScopes.push([...scopes]);
      });

    signal.publish({
      sourceId: "external-runtime",
      scope: "storage",
      reason: "storage-put",
      storageIds: ["file-1"],
      timestamp: Date.now()
    });

    await waitFor(
      () =>
        devtoolsInvalidationScopes.some(
          (scopes) =>
            scopes.includes("storage.objects") &&
            scopes.includes("storage:file-1")
        ),
      "external storage change should invalidate storage object list"
    );

    unsubscribeDevtoolsInvalidations();
    await runtime.stop();
  });

  it("reruns watched queries after receiving an external change event", async () => {
    const databasePath = path.join(rootDirectory, "external-reload.db");
    const storagePath = path.join(rootDirectory, "storage");
    const signal = new TestExternalChangeSignal();
    const applier = new TestExternalChangeApplier();
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        returns: s.array(s.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      }),
      "tasks/create": mutation({
        args: { text: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      externalChangeSignal: signal,
      externalChangeApplier: applier
    });

    await runtime.start();
    const client = runtime.createClient();
    const watch = client.watchQuery(
      createFunctionReference<
        "query",
        Record<never, never>,
        Array<{ text: string }>
      >("query", "tasks/list")
    );

    await waitFor(
      () => Array.isArray(watch.localQueryResult()),
      "initial watch"
    );

    const externalWriter = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });
    await externalWriter.start();
    await externalWriter
      .createClient()
      .mutation(
        createFunctionReference<"mutation", { text: string }, string>(
          "mutation",
          "tasks/create"
        ),
        { text: "from elsewhere" }
      );
    await externalWriter.stop();

    signal.publish({
      sourceId: "external-runtime",
      scope: "database",
      reason: "commit",
      changedTables: ["tasks"],
      timestamp: Date.now()
    });

    await waitFor(
      () => watch.localQueryResult()?.[0]?.text === "from elsewhere",
      "watch refresh after external change"
    );

    expect(applier.appliedEvents).toHaveLength(1);
    watch.dispose?.();
    await runtime.stop();
  });

  it("emits causal devtools traces with previews and invalidation links", async () => {
    const databasePath = path.join(rootDirectory, "devtools-traces.db");
    const storagePath = path.join(rootDirectory, "storage");
    const events: SyncoreDevtoolsEvent[] = [];
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        returns: s.array(s.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      }),
      "tasks/create": mutation({
        args: { text: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      devtools: {
        emit: (event) => {
          events.push(event);
        }
      }
    });

    await runtime.start();
    const client = runtime.createClient();
    const devtoolsInvalidationScopes: string[][] = [];
    const unsubscribeDevtoolsInvalidations = runtime
      .getAdmin()
      .subscribeToDevtoolsInvalidations((scopes) => {
        devtoolsInvalidationScopes.push([...scopes]);
      });
    const watch = client.watchQuery(
      createFunctionReference<"query", Record<never, never>, unknown[]>(
        "query",
        "tasks/list"
      )
    );

    await waitFor(
      () => events.some((event) => event.type === "query.executed"),
      "initial query trace"
    );

    const id = await client.mutation(
      createFunctionReference<"mutation", { text: string }, string>(
        "mutation",
        "tasks/create"
      ),
      { text: "trace me" }
    );

    await waitFor(
      () => events.some((event) => event.type === "query.invalidated"),
      "query invalidation trace"
    );

    const mutationEvent = events.find(
      (
        event
      ): event is Extract<
        SyncoreDevtoolsEvent,
        { type: "mutation.committed" }
      > =>
        event.type === "mutation.committed" &&
        event.functionName === "tasks/create"
    );
    expect(mutationEvent).toMatchObject({
      executionId: expect.any(String),
      argsPreview: {
        kind: "value",
        value: { text: "trace me" }
      },
      changedScopes: ["table:tasks"],
      changedDocumentsPreview: [
        expect.objectContaining({
          table: "tasks",
          id,
          operation: "insert"
        })
      ]
    });

    const invalidationEvent = events.find(
      (
        event
      ): event is Extract<
        SyncoreDevtoolsEvent,
        { type: "query.invalidated" }
      > => event.type === "query.invalidated"
    );
    expect(invalidationEvent).toMatchObject({
      causedByExecutionId: mutationEvent?.executionId,
      changedScopes: ["table:tasks"],
      matchedScopes: ["table:tasks"],
      rerunExecutionId: expect.any(String)
    });
    expect(mutationEvent?.timestamp).toBeLessThanOrEqual(
      invalidationEvent?.timestamp ?? 0
    );

    const rerunEvent = events.find(
      (
        event
      ): event is Extract<SyncoreDevtoolsEvent, { type: "query.executed" }> =>
        event.type === "query.executed" &&
        event.executionId === invalidationEvent?.rerunExecutionId
    );
    expect(rerunEvent?.timestamp).toBeGreaterThanOrEqual(
      invalidationEvent?.timestamp ?? 0
    );
    expect(events.indexOf(mutationEvent!)).toBeLessThan(
      events.indexOf(invalidationEvent!)
    );
    expect(events.indexOf(mutationEvent!)).toBeLessThan(
      events.indexOf(rerunEvent!)
    );
    expect(mutationEvent?.sequence).toEqual(expect.any(Number));
    expect(invalidationEvent?.sequence).toBeGreaterThan(
      mutationEvent?.sequence ?? 0
    );
    expect(rerunEvent?.sequence).toBeGreaterThan(mutationEvent?.sequence ?? 0);

    watch.dispose?.();
    expect(runtime.getAdmin().getActiveQueryInfos()).toHaveLength(0);
    expect(devtoolsInvalidationScopes).toContainEqual(
      expect.arrayContaining(["runtime.activeQueries"])
    );
    expect(devtoolsInvalidationScopes).toContainEqual(
      expect.arrayContaining(["schema.tables", "table:tasks"])
    );
    unsubscribeDevtoolsInvalidations();
    await runtime.stop();
  });

  it("pushes scoped devtools subscription updates for matching table changes", async () => {
    const databasePath = path.join(rootDirectory, "devtools-live.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      }),
      notes: defineTable({
        body: s.string()
      })
    });

    const functions = {
      "tasks/create": mutation({
        args: { text: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "notes/create": mutation({
        args: { body: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("notes", {
            body: (args as { body: string }).body
          })
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });

    await runtime.start();
    const hostDriver = new TestSqliteDriver(databasePath);
    const host = createDevtoolsSubscriptionHost({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin()
    });
    const handler = createDevtoolsCommandHandler({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin()
    });
    const taskUpdates: Array<{ rows: Record<string, unknown>[] }> = [];
    const noteUpdates: Array<{ rows: Record<string, unknown>[] }> = [];
    const schemaUpdates: Array<{ documentCounts: Record<string, number> }> = [];

    await host.subscribe("schema-sub", { kind: "schema.tables" }, (payload) => {
      if (payload.kind === "schema.tables.result") {
        schemaUpdates.push({
          documentCounts: Object.fromEntries(
            payload.tables.map((table) => [table.name, table.documentCount])
          )
        });
      }
    });

    await host.subscribe(
      "tasks-sub",
      { kind: "data.table", table: "tasks", limit: 100 },
      (payload) => {
        if (payload.kind === "data.table.result") {
          taskUpdates.push({ rows: payload.rows });
        }
      }
    );
    await host.subscribe(
      "notes-sub",
      { kind: "data.table", table: "notes", limit: 100 },
      (payload) => {
        if (payload.kind === "data.table.result") {
          noteUpdates.push({ rows: payload.rows });
        }
      }
    );

    await runtime
      .createClient()
      .mutation(
        createFunctionReference<"mutation", { text: string }, string>(
          "mutation",
          "tasks/create"
        ),
        { text: "first task" }
      );

    await waitFor(
      () => (taskUpdates.at(-1)?.rows.length ?? 0) === 1,
      "task subscription should refresh"
    );
    expect(taskUpdates.at(-1)?.rows).toHaveLength(1);
    expect(noteUpdates.at(-1)?.rows ?? []).toHaveLength(0);
    await waitFor(
      () => schemaUpdates.at(-1)?.documentCounts.tasks === 1,
      "schema tables subscription should refresh document counts"
    );
    expect(schemaUpdates.at(-1)?.documentCounts).toMatchObject({
      tasks: 1,
      notes: 0
    });

    await runtime
      .createClient()
      .mutation(
        createFunctionReference<"mutation", { body: string }, string>(
          "mutation",
          "notes/create"
        ),
        { body: "note" }
      );

    await waitFor(
      () => (noteUpdates.at(-1)?.rows.length ?? 0) === 1,
      "note subscription should refresh"
    );
    expect(taskUpdates.at(-1)?.rows).toHaveLength(1);
    expect(noteUpdates.at(-1)?.rows).toHaveLength(1);
    await waitFor(
      () => schemaUpdates.at(-1)?.documentCounts.notes === 1,
      "schema tables subscription should refresh counts for later table changes"
    );
    expect(schemaUpdates.at(-1)?.documentCounts).toMatchObject({
      tasks: 1,
      notes: 1
    });

    const exportResult = await handler({ kind: "data.export" });
    expect(exportResult.kind).toBe("data.export.result");
    if (exportResult.kind === "data.export.result") {
      expect(exportResult.tables.map((table) => table.name).sort()).toEqual([
        "notes",
        "tasks"
      ]);
      expect(
        exportResult.tables.find((table) => table.name === "tasks")?.rows
      ).toMatchObject([{ text: "first task", done: false }]);
      expect(
        exportResult.tables.find((table) => table.name === "notes")?.rows
      ).toMatchObject([{ body: "note" }]);
    }

    host.dispose();
    await hostDriver.close();
    await runtime.stop();
  });

  it("serves storage devtools list, read, delete, and subscriptions", async () => {
    const databasePath = path.join(rootDirectory, "storage-devtools.db");
    const storagePath = path.join(rootDirectory, "storage-devtools");
    const schema = defineSchema({
      files: defineTable({
        title: s.string(),
        storageId: s.string()
      })
    });

    const functions = {
      "files/write": mutation({
        args: {
          title: s.string(),
          body: s.string()
        },
        returns: s.string(),
        handler: async (ctx, args) => {
          const typedArgs = args as { title: string; body: string };
          const storageId = await (ctx as MutationCtx).storage.put({
            fileName: `${typedArgs.title}.txt`,
            contentType: "text/plain",
            data: typedArgs.body
          });
          await (ctx as MutationCtx).db.insert("files", {
            title: typedArgs.title,
            storageId
          });
          return storageId;
        }
      }),
      "files/remove": mutation({
        args: {
          id: s.string()
        },
        returns: s.null(),
        handler: async (ctx, args) => {
          await (ctx as MutationCtx).storage.delete(
            (args as { id: string }).id
          );
          return null;
        }
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });

    await runtime.start();
    const hostDriver = new TestSqliteDriver(databasePath);
    const handler = createDevtoolsCommandHandler({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin()
    });
    const host = createDevtoolsSubscriptionHost({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin()
    });
    const storageUpdates: Array<{ entries: unknown[]; totalCount: number }> =
      [];

    await host.subscribe(
      "storage-sub",
      { kind: "storage.list", limit: 100 },
      (payload) => {
        if (payload.kind === "storage.list.result") {
          storageUpdates.push({
            entries: payload.entries,
            totalCount: payload.totalCount
          });
        }
      }
    );

    const storageId = await runtime
      .createClient()
      .mutation(
        createFunctionReference<
          "mutation",
          { title: string; body: string },
          string
        >("mutation", "files/write"),
        { title: "note", body: "hello storage" }
      );

    await waitFor(
      () => (storageUpdates.at(-1)?.totalCount ?? 0) === 1,
      "storage subscription should refresh"
    );

    await runtime
      .createClient()
      .mutation(
        createFunctionReference<"mutation", { id: string }, null>(
          "mutation",
          "files/remove"
        ),
        { id: storageId }
      );

    await waitFor(
      () => (storageUpdates.at(-1)?.totalCount ?? 1) === 0,
      "storage subscription should refresh after app delete"
    );

    const storageIdAfterDelete = await runtime
      .createClient()
      .mutation(
        createFunctionReference<
          "mutation",
          { title: string; body: string },
          string
        >("mutation", "files/write"),
        { title: "note-2", body: "hello again" }
      );

    await waitFor(
      () => (storageUpdates.at(-1)?.totalCount ?? 0) === 1,
      "storage subscription should refresh after second write"
    );

    const listResult = await handler({ kind: "storage.list", limit: 100 });
    expect(listResult.kind).toBe("storage.list.result");
    if (listResult.kind === "storage.list.result") {
      expect(listResult.totalCount).toBe(1);
      expect(listResult.entries[0]).toMatchObject({
        id: storageIdAfterDelete,
        fileName: "note-2.txt",
        contentType: "text/plain"
      });
    }

    const readResult = await handler({
      kind: "storage.readRange",
      id: storageIdAfterDelete,
      offset: 0,
      length: 64
    });
    expect(readResult.kind).toBe("storage.readRange.result");
    if (readResult.kind === "storage.readRange.result") {
      expect(readResult.entry).toMatchObject({ id: storageIdAfterDelete });
      expect(Buffer.from(readResult.base64 ?? "", "base64").toString()).toBe(
        "hello again"
      );
      expect(readResult.bytesRead).toBe(11);
    }

    const missingRead = await handler({
      kind: "storage.readRange",
      id: "missing",
      offset: 0,
      length: 64
    });
    expect(missingRead.kind).toBe("storage.readRange.result");
    if (missingRead.kind === "storage.readRange.result") {
      expect(missingRead.error).toContain("not found");
    }

    const deleteResult = await handler({
      kind: "storage.delete",
      id: storageIdAfterDelete
    });
    expect(deleteResult).toEqual({
      kind: "storage.delete.result",
      success: true,
      deleted: true
    });

    await waitFor(
      () => (storageUpdates.at(-1)?.totalCount ?? 1) === 0,
      "storage subscription should refresh after delete"
    );

    const secondDelete = await handler({
      kind: "storage.delete",
      id: storageIdAfterDelete
    });
    expect(secondDelete).toEqual({
      kind: "storage.delete.result",
      success: true,
      deleted: false
    });

    await expect(
      runtime
        .createClient()
        .mutation(
          createFunctionReference<"mutation", { id: string }, null>(
            "mutation",
            "files/remove"
          ),
          { id: "../outside.txt" }
        )
    ).rejects.toThrow("Invalid storage id");

    const invalidDevtoolsDelete = await handler({
      kind: "storage.delete",
      id: "../outside.txt"
    });
    expect(invalidDevtoolsDelete).toMatchObject({
      kind: "storage.delete.result",
      success: false,
      deleted: false,
      error: expect.stringContaining("Invalid storage id")
    });

    host.dispose();
    await hostDriver.close();
    await runtime.stop();
  });

  it("lists recurring scheduler metadata and supports update/cancel no-ops", async () => {
    const databasePath = path.join(rootDirectory, "scheduler-devtools.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
    });

    const functions = {
      "tasks/create": mutation({
        args: { text: s.string() },
        returns: s.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "tasks/scheduleCreate": mutation({
        args: { text: s.string(), delayMs: s.number() },
        returns: s.null(),
        handler: async (ctx, args) => {
          const typedArgs = args as { text: string; delayMs: number };
          await (ctx as MutationCtx).scheduler.runAfter(
            typedArgs.delayMs,
            createFunctionReference("mutation", "tasks/create"),
            { text: typedArgs.text }
          );
          return null;
        }
      })
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      scheduler: {
        recurringJobs: cronJobs()
          .interval(
            "cleanup",
            { minutes: 5 },
            createFunctionReference("mutation", "tasks/create"),
            { text: "cleanup" },
            { type: "skip" }
          )
          .daily(
            "digest",
            {
              hour: 9,
              minute: 30,
              timezone: "America/Sao_Paulo"
            },
            createFunctionReference("mutation", "tasks/create"),
            { text: "digest" }
          )
          .weekly(
            "report",
            {
              dayOfWeek: "monday",
              hour: 8,
              minute: 15,
              timezone: "UTC"
            },
            createFunctionReference("mutation", "tasks/create"),
            { text: "report" }
          ).jobs
      }
    });

    await runtime.start();
    await runtime
      .createClient()
      .mutation(createFunctionReference("mutation", "tasks/scheduleCreate"), {
        text: "one-shot",
        delayMs: 60_000
      });
    const hostDriver = new TestSqliteDriver(databasePath);
    const handler = createDevtoolsCommandHandler({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin()
    });
    const host = createDevtoolsSubscriptionHost({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin()
    });
    const schedulerSnapshots: SchedulerJob[][] = [];

    await host.subscribe(
      "scheduler-jobs",
      { kind: "scheduler.jobs" },
      (payload) => {
        if (payload.kind === "scheduler.jobs.result") {
          schedulerSnapshots.push(payload.jobs);
        }
      }
    );

    const initialJobs = schedulerSnapshots.at(-1) ?? [];
    expect(initialJobs).toHaveLength(4);
    expect(
      initialJobs
        .filter((job) => job.recurringName)
        .map((job) => job.recurringName)
        .sort()
    ).toEqual(["cleanup", "digest", "report"]);
    const oneShotJob = initialJobs.find((job) => !job.recurringName);
    expect(oneShotJob?.functionName).toBe("tasks/create");
    expect(
      initialJobs.find((job) => job.recurringName === "cleanup")?.schedule
    ).toEqual({
      type: "interval",
      minutes: 5
    });
    expect(
      initialJobs.find((job) => job.recurringName === "digest")?.scheduleLabel
    ).toContain("Daily");
    expect(
      initialJobs.find((job) => job.recurringName === "report")?.schedule
    ).toEqual({
      type: "weekly",
      dayOfWeek: "monday",
      hour: 8,
      minute: 15,
      timezone: "UTC"
    });

    const updateResult = await handler({
      kind: "scheduler.update",
      jobId: "recurring:cleanup",
      schedule: { type: "interval", minutes: 15 },
      args: { text: "cleanup-updated" },
      misfirePolicy: { type: "windowed", windowMs: 30_000 }
    });

    expect(updateResult.kind).toBe("scheduler.update.result");
    if (updateResult.kind === "scheduler.update.result") {
      expect(updateResult.success).toBe(true);
      expect(updateResult.updated).toBe(true);
      expect(updateResult.job?.args).toEqual({ text: "cleanup-updated" });
      expect(updateResult.job?.misfirePolicy).toEqual({
        type: "windowed",
        windowMs: 30_000
      });
    }

    await waitFor(
      () =>
        (schedulerSnapshots.at(-1) ?? []).find(
          (job) => job.id === "recurring:cleanup"
        )?.args.text === "cleanup-updated",
      "scheduler subscription should refresh after update"
    );

    expect(oneShotJob).toBeDefined();
    const oneShotUpdateResult = await handler({
      kind: "scheduler.update",
      jobId: oneShotJob!.id,
      args: { text: "one-shot-updated" },
      runAt: oneShotJob!.runAt + 30_000
    });
    expect(oneShotUpdateResult.kind).toBe("scheduler.update.result");
    if (oneShotUpdateResult.kind === "scheduler.update.result") {
      expect(oneShotUpdateResult.success).toBe(true);
      expect(oneShotUpdateResult.updated).toBe(true);
      expect(oneShotUpdateResult.job?.args).toEqual({
        text: "one-shot-updated"
      });
      expect(oneShotUpdateResult.job?.runAt).toBe(oneShotJob!.runAt + 30_000);
      expect(oneShotUpdateResult.job?.schedule).toBeUndefined();
    }

    const cancelResult = await handler({
      kind: "scheduler.cancel",
      jobId: "recurring:cleanup"
    });
    expect(cancelResult).toEqual({
      kind: "scheduler.cancel.result",
      success: true,
      cancelled: true
    });

    await waitFor(
      () =>
        (schedulerSnapshots.at(-1) ?? []).find(
          (job) => job.id === "recurring:cleanup"
        )?.status === "cancelled",
      "scheduler subscription should refresh after cancellation"
    );

    const noOpCancel = await handler({
      kind: "scheduler.cancel",
      jobId: "recurring:cleanup"
    });
    expect(noOpCancel).toEqual({
      kind: "scheduler.cancel.result",
      success: true,
      cancelled: false
    });

    const noOpUpdate = await handler({
      kind: "scheduler.update",
      jobId: "recurring:cleanup",
      schedule: { type: "interval", minutes: 30 },
      args: { text: "ignored" },
      misfirePolicy: { type: "catch_up" }
    });
    expect(noOpUpdate).toEqual({
      kind: "scheduler.update.result",
      success: true,
      updated: false
    });

    host.dispose();
    await hostDriver.close();
    await runtime.stop();
  });

  it("reconciles interrupted staged storage writes on restart", async () => {
    const databasePath = path.join(rootDirectory, "storage-recovery.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      files: defineTable({
        label: s.string()
      })
    });

    const functions = {
      "files/write": mutation({
        args: {
          label: s.string(),
          body: s.string()
        },
        returns: s.string(),
        handler: async (ctx, args) => {
          const typedCtx = ctx as MutationCtx;
          return typedCtx.storage.put({
            fileName: `${(args as { label: string }).label}.txt`,
            contentType: "text/plain",
            data: (args as { body: string }).body
          });
        }
      })
    };

    const crashingRuntime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new InterruptingStorageAdapter(storagePath)
    });

    await crashingRuntime.start();
    await expect(
      crashingRuntime
        .createClient()
        .mutation(
          createFunctionReference<
            "mutation",
            { label: string; body: string },
            string
          >("mutation", "files/write"),
          {
            label: "interrupted",
            body: "hello"
          }
        )
    ).rejects.toThrow(/simulated crash/i);
    await crashingRuntime.stop().catch(() => undefined);
    const interruptedFiles = await readDirectorySafe(storagePath);
    expect(interruptedFiles).toHaveLength(1);

    const recoveryStorage = new TrackingStorageAdapter(storagePath);

    const recoveryRuntime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: recoveryStorage
    });

    await recoveryRuntime.start();
    const database = new DatabaseSync(databasePath);
    const pendingRows = database
      .prepare(`SELECT COUNT(*) as count FROM "_storage_pending"`)
      .all() as Array<{ count: number }>;
    database.close();
    expect(pendingRows[0]?.count ?? 0).toBe(0);
    expect(recoveryStorage.deletedIds).toEqual(interruptedFiles);
    await recoveryRuntime.stop();
  });

  it("returns persisted storage metadata instead of adapter-derived metadata", async () => {
    const databasePath = path.join(rootDirectory, "storage-metadata.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      files: defineTable({
        label: s.string()
      })
    });

    const functions = {
      "files/write": mutation({
        args: {
          label: s.string(),
          body: s.string()
        },
        returns: s.string(),
        handler: async (ctx, args) => {
          const typedCtx = ctx as MutationCtx;
          return typedCtx.storage.put({
            fileName: `${(args as { label: string }).label}.txt`,
            contentType: "text/plain",
            data: (args as { body: string }).body
          });
        }
      }),
      "files/read": query({
        args: {
          id: s.string()
        },
        returns: s.any(),
        handler: async (ctx, args) => {
          return (ctx as QueryCtx).storage.get((args as { id: string }).id);
        }
      })
    };

    const firstRuntime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });
    await firstRuntime.start();
    const fileId = await firstRuntime
      .createClient()
      .mutation(
        createFunctionReference<
          "mutation",
          { label: string; body: string },
          string
        >("mutation", "files/write"),
        {
          label: "metadata",
          body: "body"
        }
      );
    await firstRuntime.stop();

    const secondRuntime = new SyncoreRuntime({
      schema,
      functions,
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath)
    });
    await secondRuntime.start();
    const metadata = await secondRuntime
      .createClient()
      .query(
        createFunctionReference<"query", { id: string }, StorageObject | null>(
          "query",
          "files/read"
        ),
        { id: fileId }
      );
    expect(metadata?.contentType).toBe("text/plain");
    await secondRuntime.stop();
  });
});

async function readDirectorySafe(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

async function waitFor(
  predicate: () => boolean,
  message: string
): Promise<void> {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
