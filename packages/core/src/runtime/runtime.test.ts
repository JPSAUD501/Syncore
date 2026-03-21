import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SchedulerJob } from "@syncore/devtools-protocol";
import { defineSchema, defineTable, v } from "../../../schema/src/index.js";
import { cronJobs, mutation, query } from "./functions.js";
import {
  createFunctionReference,
  type ImpactScope,
  type SyncoreExternalChangeApplier,
  type SyncoreExternalChangeEvent,
  type SyncoreExternalChangeSignal,
  type QueryCtx,
  type SyncoreExperimentalPlugin,
  type MutationCtx,
  type StorageObject,
  type StorageWriteInput,
  SyncoreRuntime,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter
} from "./runtime.js";
import {
  createDevtoolsCommandHandler,
  createDevtoolsSubscriptionHost,
  type DevtoolsSqlAnalysis,
  type DevtoolsSqlReadResult,
  type DevtoolsSqlSupport
} from "./devtools.js";

const require = createRequire(import.meta.url);
const { Parser } = require("node-sql-parser") as {
  Parser: new () => {
    astify(sql: string, options?: { database?: string }): unknown;
  };
};
const parser = new Parser();

type SqlAst = {
  type: string;
  from?: Array<{ table?: string; expr?: { ast?: SqlAst } }>;
  table?: Array<{ table?: string }> | { table?: string } | null | string;
};

const analyzeSqlStatement = (query: string): DevtoolsSqlAnalysis => {
  const ast = parser.astify(query, { database: "sqlite" }) as SqlAst | SqlAst[];
  if (Array.isArray(ast)) {
    throw new Error("Only a single SQL statement is supported.");
  }

  switch (ast.type) {
    case "select":
      return buildReadAnalysis(ast);
    case "update":
    case "delete":
    case "insert":
    case "replace":
      return buildWriteAnalysis(extractTables(ast.table), false);
    case "create":
    case "drop":
    case "alter":
      return buildWriteAnalysis(extractTables(ast.table), true);
    default:
      throw new Error(`Unsupported SQL statement type: ${String(ast.type)}`);
  }
};

const ensureSqlMode: DevtoolsSqlSupport["ensureSqlMode"] = (
  analysis,
  expected
) => {
  if (expected === "watch") {
    if (analysis.mode !== "read") {
      throw new Error("Live mode supports read-only SQL only.");
    }
    return;
  }

  if (analysis.mode !== expected) {
    if (expected === "read") {
      throw new Error("Use SQL Write for mutating statements.");
    }
    throw new Error("Use SQL Read or SQL Live for read-only statements.");
  }
};

const runReadonlyQuery = (
  databasePath: string,
  query: string
): DevtoolsSqlReadResult => {
  const analysis = analyzeSqlStatement(query);
  ensureSqlMode(analysis, "read");

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const statement = database.prepare(query);
    const rows = statement.all() as Array<Record<string, unknown>>;
    const columnsMeta = statement.columns();
    const columns = columnsMeta.map((column) => column.name);
    const observedTables = Array.from(
      new Set(
        columnsMeta
          .map((column) => column.table)
          .filter((table): table is string => typeof table === "string")
      )
    );

    return {
      columns,
      rows: rows.map((row) => columns.map((column) => row[column])),
      observedTables:
        observedTables.length > 0 ? observedTables : analysis.readTables
    };
  } finally {
    database.close();
  }
};

const nodeDevtoolsSqlSupport: DevtoolsSqlSupport = {
  analyzeSqlStatement,
  ensureSqlMode,
  runReadonlyQuery
};

function buildReadAnalysis(ast: SqlAst): DevtoolsSqlAnalysis {
  const readTables = Array.from(new Set(extractReadTables(ast)));
  return {
    mode: "read",
    readTables,
    writeTables: [],
    schemaChanged: false,
    observedScopes:
      readTables.length > 0
        ? readTables.map((table) => `table:${table}` as const)
        : ["all"]
  };
}

function buildWriteAnalysis(
  tables: string[],
  schemaChanged: boolean
): DevtoolsSqlAnalysis {
  const uniqueTables = Array.from(new Set(tables));
  return {
    mode: schemaChanged ? "ddl" : "write",
    readTables: [],
    writeTables: uniqueTables,
    schemaChanged,
    observedScopes: schemaChanged
      ? [
          "schema.tables",
          ...uniqueTables.map((table) => `table:${table}` as const)
        ]
      : uniqueTables.length > 0
        ? uniqueTables.map((table) => `table:${table}` as const)
        : ["all"]
  };
}

function extractReadTables(ast: SqlAst): string[] {
  return (ast.from ?? [])
    .flatMap((entry) => {
      if (entry.table) {
        return [entry.table];
      }
      if (entry.expr?.ast) {
        return extractReadTables(entry.expr.ast);
      }
      return [];
    })
    .filter((table) => table !== "dual");
}

function extractTables(table: SqlAst["table"]): string[] {
  if (Array.isArray(table)) {
    return table
      .map((entry) => entry?.table)
      .filter((value): value is string => typeof value === "string");
  }
  if (table && typeof table === "object") {
    return typeof table.table === "string" ? [table.table] : [];
  }
  if (typeof table === "string") {
    return [table];
  }
  return [];
}

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
          ...(event.changedTables ?? []).map((tableName) => `table:${tableName}`),
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

  it("fails fast when destructive schema changes are detected", async () => {
    const databasePath = path.join(rootDirectory, "syncore.db");
    const storagePath = path.join(rootDirectory, "storage");
    const functions = {
      "tasks/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      })
    };

    const firstRuntime = new SyncoreRuntime({
      schema: defineSchema({
        tasks: defineTable({
          text: v.string(),
          done: v.boolean()
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
          text: v.string(),
          done: v.boolean()
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
        text: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      }),
      "tasks/create": mutation({
        args: { text: v.string() },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "tasks/scheduleCreate": mutation({
        args: { text: v.string(), delayMs: v.number() },
        returns: v.null(),
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

  it("injects runtime capabilities and experimental plugin capabilities into function contexts", async () => {
    const databasePath = path.join(rootDirectory, "capabilities.db");
    const storagePath = path.join(rootDirectory, "storage");
    const lifecycleEvents: string[] = [];
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });

    const plugin: SyncoreExperimentalPlugin<typeof schema> = {
      name: "test-plugin",
      capabilities: {
        pluginOnly: "enabled"
      },
      onStart() {
        lifecycleEvents.push("start");
      },
      onStop() {
        lifecycleEvents.push("stop");
      }
    };

    const runtime = new SyncoreRuntime({
      schema,
      functions: {
        "tasks/readCapabilities": query({
          args: {},
          returns: v.object({
            platformProvided: v.string(),
            pluginOnly: v.string()
          }),
          handler: async (ctx) => {
            const capabilities = (ctx as QueryCtx).capabilities as Record<
              string,
              string
            >;
            return {
              platformProvided: capabilities.platformProvided,
              pluginOnly: capabilities.pluginOnly
            };
          }
        })
      },
      driver: new TestSqliteDriver(databasePath),
      storage: new TestStorageAdapter(storagePath),
      capabilities: {
        platformProvided: "node"
      },
      experimentalPlugins: [plugin]
    });

    await runtime.start();

    const result = await runtime.createClient().query(
      createFunctionReference<
        "query",
        Record<never, never>,
        {
          platformProvided: string;
          pluginOnly: string;
        }
      >("query", "tasks/readCapabilities")
    );

    expect(result).toEqual({
      platformProvided: "node",
      pluginOnly: "enabled"
    });

    await runtime.stop();

    expect(lifecycleEvents).toEqual(["start", "stop"]);
  });

  it("publishes external change events for database and storage writes", async () => {
    const databasePath = path.join(rootDirectory, "external-events.db");
    const storagePath = path.join(rootDirectory, "storage");
    const signal = new TestExternalChangeSignal();
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      }),
      files: defineTable({
        label: v.string()
      })
    });

    const functions = {
      "tasks/create": mutation({
        args: { text: v.string() },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "files/write": mutation({
        args: {
          label: v.string(),
          body: v.string()
        },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).storage.put({
            fileName: `${(args as { label: string }).label}.txt`,
            contentType: "text/plain",
            data: (args as { body: string }).body
          })
      }),
      "files/remove": mutation({
        args: { id: v.string() },
        returns: v.null(),
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
          storageIds: [fileId]
        }),
        expect.objectContaining({
          scope: "storage",
          reason: "storage-delete",
          storageIds: [fileId]
        })
      ])
    );
  });

  it("reruns watched queries after receiving an external change event", async () => {
    const databasePath = path.join(rootDirectory, "external-reload.db");
    const storagePath = path.join(rootDirectory, "storage");
    const signal = new TestExternalChangeSignal();
    const applier = new TestExternalChangeApplier();
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "tasks/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("tasks").collect()
      }),
      "tasks/create": mutation({
        args: { text: v.string() },
        returns: v.string(),
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

  it("pushes scoped devtools subscription updates for matching table changes", async () => {
    const databasePath = path.join(rootDirectory, "devtools-live.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      }),
      notes: defineTable({
        body: v.string()
      })
    });

    const functions = {
      "tasks/create": mutation({
        args: { text: v.string() },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("tasks", {
            text: (args as { text: string }).text,
            done: false
          })
      }),
      "notes/create": mutation({
        args: { body: v.string() },
        returns: v.string(),
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
      admin: runtime.getAdmin(),
      sql: nodeDevtoolsSqlSupport
    });
    const taskUpdates: Array<{ rows: Record<string, unknown>[] }> = [];
    const noteUpdates: Array<{ rows: Record<string, unknown>[] }> = [];

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

    await host.subscribe(
      "sql-watch",
      { kind: "sql.watch", query: 'SELECT _id FROM "tasks" LIMIT 10' },
      () => {
        // Warm the lazy SQL module so scope analysis is available synchronously.
      }
    );
    host.unsubscribe("sql-watch");

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

    host.dispose();
    await hostDriver.close();
    await runtime.stop();
  });

  it("lists recurring scheduler metadata and supports update/cancel no-ops", async () => {
    const databasePath = path.join(rootDirectory, "scheduler-devtools.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });

    const functions = {
      "tasks/create": mutation({
        args: { text: v.string() },
        returns: v.string(),
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
    const hostDriver = new TestSqliteDriver(databasePath);
    const handler = createDevtoolsCommandHandler({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin(),
      sql: nodeDevtoolsSqlSupport
    });
    const host = createDevtoolsSubscriptionHost({
      driver: hostDriver,
      schema,
      functions,
      admin: runtime.getAdmin(),
      sql: nodeDevtoolsSqlSupport
    });
    const schedulerSnapshots: SchedulerJob[][] = [];

    await host.subscribe("scheduler-jobs", { kind: "scheduler.jobs" }, (payload) => {
      if (payload.kind === "scheduler.jobs.result") {
        schedulerSnapshots.push(payload.jobs);
      }
    });

    const initialJobs = schedulerSnapshots.at(-1) ?? [];
    expect(initialJobs).toHaveLength(3);
    expect(initialJobs.map((job) => job.recurringName).sort()).toEqual([
      "cleanup",
      "digest",
      "report"
    ]);
    expect(initialJobs.find((job) => job.recurringName === "cleanup")?.schedule).toEqual({
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

  it("analyzes SQL for read, write, and watch flows without regex", async () => {
    const databasePath = path.join(rootDirectory, "sql-analysis.db");
    const driver = new TestSqliteDriver(databasePath);
    await driver.exec(
      'CREATE TABLE "tasks" (_id TEXT PRIMARY KEY, _creationTime INTEGER, _json TEXT)'
    );
    await driver.run(
      'INSERT INTO "tasks" (_id, _creationTime, _json) VALUES (?, ?, ?)',
      ["task-1", Date.now(), JSON.stringify({ text: "hello", done: false })]
    );

    const selectAnalysis = analyzeSqlStatement(
      'SELECT _id, _json FROM "tasks" LIMIT 10'
    );
    expect(selectAnalysis.mode).toBe("read");
    expect(selectAnalysis.readTables).toEqual(["tasks"]);

    const updateAnalysis = analyzeSqlStatement(
      'UPDATE "tasks" SET _json = json_set(_json, "$.done", true)'
    );
    expect(updateAnalysis.mode).toBe("write");
    expect(updateAnalysis.writeTables).toEqual(["tasks"]);

    expect(() => ensureSqlMode(updateAnalysis, "watch")).toThrow(
      /read-only SQL/i
    );

    const queryResult = runReadonlyQuery(
      databasePath,
      'SELECT _id, _json FROM "tasks" LIMIT 10'
    );
    expect(queryResult.columns).toEqual(["_id", "_json"]);
    expect(queryResult.rows).toHaveLength(1);
    expect(queryResult.observedTables).toEqual(["tasks"]);

    await driver.close();
  });

  it("reports SQL devtools unavailable without node SQL support", async () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
    });
    const runtime = new SyncoreRuntime({
      schema,
      functions: {},
      driver: new TestSqliteDriver(
        path.join(rootDirectory, "no-sql-devtools.db")
      ),
      storage: new TrackingStorageAdapter(
        path.join(rootDirectory, "no-sql-devtools-storage")
      ),
      platform: "browser"
    });

    await runtime.start();
    try {
      const hostDriver = new TestSqliteDriver(
        path.join(rootDirectory, "no-sql-devtools-host.db")
      );
      const result = await createDevtoolsCommandHandler({
        driver: hostDriver,
        schema,
        functions: {},
        admin: runtime.getAdmin()
      })({
        kind: "sql.read",
        query: 'SELECT _id FROM "tasks"'
      });

      expect(result.kind).toBe("sql.read.result");
      if (result.kind === "sql.read.result") {
        expect(result.error).toMatch(/only available in Node-hosted runtimes/i);
      }
      await hostDriver.close();
    } finally {
      await runtime.stop();
    }
  });

  it("reconciles interrupted staged storage writes on restart", async () => {
    const databasePath = path.join(rootDirectory, "storage-recovery.db");
    const storagePath = path.join(rootDirectory, "storage");
    const schema = defineSchema({
      files: defineTable({
        label: v.string()
      })
    });

    const functions = {
      "files/write": mutation({
        args: {
          label: v.string(),
          body: v.string()
        },
        returns: v.string(),
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
        label: v.string()
      })
    });

    const functions = {
      "files/write": mutation({
        args: {
          label: v.string(),
          body: v.string()
        },
        returns: v.string(),
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
          id: v.string()
        },
        returns: v.any(),
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
