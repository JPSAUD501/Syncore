import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import WebSocket from "ws";
import type {
  SyncoreDevtoolsMessage,
  SyncoreDevtoolsSnapshot
} from "@syncore/devtools-protocol";
import {
  type AnySyncoreSchema,
  type DevtoolsSink,
  type SchedulerOptions,
  type StorageObject,
  type StorageWriteInput,
  type SyncoreCapabilities,
  type SyncoreExperimentalPlugin,
  SyncoreRuntime,
  type SyncoreRuntimeOptions,
  type SyncoreSqlDriver,
  type SyncoreStorageAdapter
} from "syncore";
export * from "./ipc.js";
export type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsSnapshot
} from "@syncore/devtools-protocol";

export type NodeSyncoreSchema = AnySyncoreSchema;

function normalizeData(input: StorageWriteInput["data"]): Uint8Array {
  if (typeof input === "string") {
    return Buffer.from(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
}

function toSqlParameters(params: unknown[]): SQLInputValue[] {
  return params as SQLInputValue[];
}

export class NodeSqliteDriver implements SyncoreSqlDriver {
  private readonly database: DatabaseSync;
  private transactionDepth = 0;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA journal_mode = WAL;");
  }

  async exec(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid?: number | string; }> {
    const statement = this.database.prepare(sql);
    const result = statement.run(...toSqlParameters(params));
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid
    };
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const statement = this.database.prepare(sql);
    return statement.get(...toSqlParameters(params)) as T | undefined;
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const statement = this.database.prepare(sql);
    return statement.all(...toSqlParameters(params)) as T[];
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

export class NodeFileStorageAdapter implements SyncoreStorageAdapter {
  constructor(private readonly directory: string) {}

  private filePath(id: string): string {
    return path.join(this.directory, id);
  }

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    await mkdir(this.directory, { recursive: true });
    const filePath = this.filePath(id);
    const bytes = normalizeData(input.data);
    await writeFile(filePath, bytes);
    return {
      id,
      path: filePath,
      size: bytes.byteLength,
      contentType: input.contentType ?? null
    };
  }

  async get(id: string): Promise<StorageObject | null> {
    const filePath = this.filePath(id);
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
      return await readFile(this.filePath(id));
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    await rm(this.filePath(id), { force: true });
  }

  async list(): Promise<StorageObject[]> {
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      const objects = await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const filePath = this.filePath(entry.name);
            const info = await stat(filePath);
            return {
              id: entry.name,
              path: filePath,
              size: info.size,
              contentType: null
            } satisfies StorageObject;
          })
      );
      return objects;
    } catch {
      return [];
    }
  }
}

export interface CreateNodeRuntimeOptions {
  databasePath: string;
  storageDirectory: string;
  schema: NodeSyncoreSchema;
  functions: SyncoreRuntimeOptions<NodeSyncoreSchema>["functions"];
  capabilities?: SyncoreCapabilities;
  experimentalPlugins?: Array<SyncoreExperimentalPlugin<NodeSyncoreSchema>>;
  platform?: string;
  devtools?: DevtoolsSink;
  devtoolsUrl?: string;
  scheduler?: SchedulerOptions;
}

export function createNodeSyncoreRuntime(
  options: CreateNodeRuntimeOptions
): SyncoreRuntime<NodeSyncoreSchema> {
  const websocketDevtools =
    !options.devtools && options.devtoolsUrl
      ? createNodeWebSocketDevtoolsSink({
          url: options.devtoolsUrl
        })
      : undefined;
  const runtimeOptions: SyncoreRuntimeOptions<NodeSyncoreSchema> = {
    schema: options.schema,
    functions: options.functions,
    driver: new NodeSqliteDriver(options.databasePath),
    storage: new NodeFileStorageAdapter(options.storageDirectory),
    platform: options.platform ?? "node"
  };
  if (options.capabilities) {
    runtimeOptions.capabilities = options.capabilities;
  }
  if (options.experimentalPlugins) {
    runtimeOptions.experimentalPlugins = options.experimentalPlugins;
  }
  const resolvedDevtools = options.devtools ?? websocketDevtools;
  if (resolvedDevtools) {
    runtimeOptions.devtools = resolvedDevtools;
  }
  if (options.scheduler) {
    runtimeOptions.scheduler = options.scheduler;
  }
  const runtime = new SyncoreRuntime(runtimeOptions);
  websocketDevtools?.attachRuntime(() => runtime.getDevtoolsSnapshot());
  if (websocketDevtools) {
    const stop = runtime.stop.bind(runtime);
    runtime.stop = async () => {
      websocketDevtools.dispose();
      await stop();
    };
  }
  return runtime;
}

export function createNodeSyncoreClient(runtime: SyncoreRuntime<NodeSyncoreSchema>) {
  return runtime.createClient();
}

export interface NodeWebSocketDevtoolsSinkOptions {
  url: string;
  reconnectDelayMs?: number;
}

export interface NodeWebSocketDevtoolsSink extends DevtoolsSink {
  attachRuntime(getSnapshot: () => SyncoreDevtoolsSnapshot): void;
  dispose(): void;
}

export function createNodeWebSocketDevtoolsSink(
  options: NodeWebSocketDevtoolsSinkOptions
): NodeWebSocketDevtoolsSink {
  let socket: WebSocket | undefined;
  let disposed = false;
  let connectTimer: NodeJS.Timeout | undefined;
  let getSnapshot: (() => SyncoreDevtoolsSnapshot) | undefined;
  const pendingMessages: SyncoreDevtoolsMessage[] = [];
  let latestHello:
    | {
        runtimeId: string;
        platform: string;
      }
    | undefined;

  const connect = () => {
    if (disposed) {
      return;
    }
    socket = new WebSocket(options.url);
    socket.on("open", () => {
      if (latestHello) {
        sendNow({
          type: "hello",
          runtimeId: latestHello.runtimeId,
          platform: latestHello.platform
        });
      }
      if (getSnapshot) {
        sendNow({
          type: "snapshot",
          snapshot: getSnapshot()
        });
      }
      flushPendingMessages();
    });
    socket.on("message", (payload) => {
      const rawPayload =
        typeof payload === "string"
          ? payload
          : payload instanceof Buffer
            ? payload.toString("utf8")
            : Array.isArray(payload)
              ? Buffer.concat(payload).toString("utf8")
              : payload instanceof ArrayBuffer
                ? Buffer.from(payload).toString("utf8")
                : Buffer.from(
                    payload.buffer,
                    payload.byteOffset,
                    payload.byteLength
                  ).toString("utf8");
      if (rawPayload.length === 0) {
        return;
      }
      const message = JSON.parse(rawPayload) as SyncoreDevtoolsMessage;
      if (message.type === "ping") {
        send({ type: "pong" });
      }
    });
    socket.on("close", scheduleReconnect);
    socket.on("error", scheduleReconnect);
  };

  const scheduleReconnect = () => {
    if (disposed || connectTimer) {
      return;
    }
    connectTimer = setTimeout(() => {
      connectTimer = undefined;
      connect();
    }, options.reconnectDelayMs ?? 1200);
  };

  const sendNow = (message: SyncoreDevtoolsMessage) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const flushPendingMessages = () => {
    while (pendingMessages.length > 0) {
      const nextMessage = pendingMessages.shift();
      if (!nextMessage) {
        continue;
      }
      sendNow(nextMessage);
    }
  };

  const send = (message: SyncoreDevtoolsMessage) => {
    if (socket?.readyState === WebSocket.OPEN) {
      sendNow(message);
      return;
    }
    pendingMessages.push(message);
  };

  connect();

  return {
    emit(event) {
      if (event.type === "runtime.connected") {
        latestHello = {
          runtimeId: event.runtimeId,
          platform: event.platform
        };
        send({
          type: "hello",
          runtimeId: event.runtimeId,
          platform: event.platform
        });
      }
      send({
        type: "event",
        event
      });
      if (getSnapshot) {
        send({
          type: "snapshot",
          snapshot: getSnapshot()
        });
      }
    },
    attachRuntime(snapshotGetter) {
      getSnapshot = snapshotGetter;
      if (socket?.readyState === WebSocket.OPEN) {
        send({
          type: "snapshot",
          snapshot: getSnapshot()
        });
      }
    },
    dispose() {
      disposed = true;
      if (connectTimer) {
        clearTimeout(connectTimer);
      }
      socket?.close();
    }
  };
}
