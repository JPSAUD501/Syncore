import "fake-indexeddb/auto";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFunctionReference,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
  SyncoreRuntime
} from "@syncore/core";
import { defineSchema, defineTable, v } from "@syncore/schema";
import {
  createWebSyncoreRuntime,
  createWebWorkerRuntime,
  BrowserFileStorageAdapter,
  type SyncoreWebPersistence
} from "./index.js";
import {
  BroadcastChannelExternalChangeSignal,
  SqlJsExternalChangeApplier
} from "./external-change.js";
import { SqlJsDriver } from "./sqljs.js";
import { SyncoreIndexedDbPersistence } from "./indexeddb.js";

const storageSchema = defineSchema({
  files: defineTable({
    label: v.string()
  })
});

const storageFunctions = {
  "files/write": mutation({
    args: { label: v.string(), body: v.string() },
    returns: v.string(),
    handler: async (ctx, args) =>
      (ctx as MutationCtx).storage.put({
        fileName: `${(args as { label: string }).label}.txt`,
        contentType: "text/plain",
        data: (args as { body: string }).body
      })
  }),
  "files/get": query({
    args: { id: v.string() },
    returns: v.any(),
    handler: async (ctx, args) =>
      (ctx as QueryCtx).storage.get((args as { id: string }).id)
  })
};

const wasmFilePath = fileURLToPath(
  new URL("../node_modules/sql.js/dist/sql-wasm.wasm", import.meta.url)
);

describe("platform-web sql.js runtime", () => {
  beforeEach(async () => {
    await deleteDatabase("syncore-web-test");
  });

  afterEach(async () => {
    await deleteDatabase("syncore-web-test");
  });

  it("persists sqlite state into IndexedDB between runtime instances", async () => {
    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      }),
      "todos/create": mutation({
        args: { title: v.string() },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("todos", {
            title: (args as { title: string }).title,
            complete: false
          })
      })
    };

    const firstRuntime = await createWebSyncoreRuntime({
      databaseName: "todos",
      persistenceDatabaseName: "syncore-web-test",
      schema,
      functions,
      locateFile: () => wasmFilePath
    });
    await firstRuntime.start();
    await firstRuntime
      .createClient()
      .mutation(createFunctionReference("mutation", "todos/create"), {
        title: "Persist me"
      });
    await firstRuntime.stop();

    const secondRuntime = await createWebSyncoreRuntime({
      databaseName: "todos",
      persistenceDatabaseName: "syncore-web-test",
      schema,
      functions,
      locateFile: () => wasmFilePath
    });
    await secondRuntime.start();
    const rows = await secondRuntime
      .createClient()
      .query(
        createFunctionReference<
          "query",
          Record<never, never>,
          Array<{ title: string }>
        >("query", "todos/list")
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Persist me");
    await secondRuntime.stop();
  });

  it("creates a worker runtime attachment with one helper", async () => {
    const messages: unknown[] = [];
    const listeners = new Set<(event: MessageEvent<unknown>) => void>();
    const endpoint = {
      postMessage(message: unknown) {
        messages.push(message);
      },
      addEventListener(
        _type: "message",
        listener: (event: MessageEvent<unknown>) => void
      ) {
        listeners.add(listener);
      },
      removeEventListener(
        _type: "message",
        listener: (event: MessageEvent<unknown>) => void
      ) {
        listeners.delete(listener);
      }
    };

    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });
    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      })
    };

    const attached = createWebWorkerRuntime({
      endpoint,
      schema,
      functions,
      locateFile: () => wasmFilePath,
      persistenceDatabaseName: "syncore-web-test"
    });

    await attached.ready;
    expect(messages).toContainEqual({ type: "runtime.ready" });
    await attached.dispose();
  });

  it("auto-connects devtools from a blob worker on localhost", async () => {
    const sentMessages: string[] = [];

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(public readonly url: string) {
        expect(url).toBe("ws://127.0.0.1:4311");
        queueMicrotask(() => this.onopen?.());
      }

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {}
    }

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal(
      "location",
      new URL("blob:http://localhost:3000/worker-token") as unknown as Location
    );

    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      })
    };

    try {
      const runtime = await createWebSyncoreRuntime({
        databaseName: "todos",
        persistenceDatabaseName: "syncore-web-test",
        schema,
        functions,
        locateFile: () => wasmFilePath,
        platform: "browser-worker"
      });

      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(
        sentMessages.some((payload) => payload.includes('"type":"hello"'))
      ).toBe(true);
      expect(
        sentMessages.some((payload) => payload.includes('"type":"event"'))
      ).toBe(true);

      await runtime.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("auto-connects devtools from a private LAN host", async () => {
    const sentMessages: string[] = [];

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(public readonly url: string) {
        expect(url).toBe("ws://127.0.0.1:4311");
        queueMicrotask(() => this.onopen?.());
      }

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {}
    }

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal(
      "location",
      new URL("http://192.168.1.115:3000/") as unknown as Location
    );

    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      })
    };

    try {
      const runtime = await createWebSyncoreRuntime({
        databaseName: "todos-lan",
        persistenceDatabaseName: "syncore-web-test",
        schema,
        functions,
        locateFile: () => wasmFilePath,
        platform: "browser-worker"
      });

      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(sentMessages.length).toBeGreaterThan(0);
      expect(
        sentMessages.some((payload) => payload.includes('"type":"hello"'))
      ).toBe(true);
      expect(
        sentMessages.some((payload) => payload.includes('"type":"event"'))
      ).toBe(true);

      await runtime.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("labels Edge sessions as Edge instead of Chrome", async () => {
    const sentMessages: string[] = [];
    const storage = new Map<string, string>();

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(public readonly url: string) {
        expect(url).toBe("ws://127.0.0.1:4311");
        queueMicrotask(() => this.onopen?.());
      }

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {}
    }

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal(
      "location",
      new URL("http://localhost:3000/") as unknown as Location
    );
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0"
    } as Navigator);
    vi.stubGlobal("localStorage", {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    } as Storage);
    globalThis.localStorage.setItem("syncore-session-name", "Crystal Blaze");

    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      })
    };

    try {
      const runtime = await createWebSyncoreRuntime({
        databaseName: "todos-edge",
        persistenceDatabaseName: "syncore-web-test",
        schema,
        functions,
        locateFile: () => wasmFilePath,
        platform: "browser"
      });

      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const helloPayload = sentMessages.find((payload) =>
        payload.includes('"type":"hello"')
      );
      expect(helloPayload).toBeDefined();
      expect(helloPayload).toContain('"sessionLabel":"Crystal Blaze (Edge)"');

      await runtime.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("derives different storage identities for different browser stores", async () => {
    const sentMessages: string[] = [];

    class MockWebSocket {
      static OPEN = 1;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(public readonly url: string) {
        expect(url).toBe("ws://127.0.0.1:4311");
        queueMicrotask(() => this.onopen?.());
      }

      send(payload: string) {
        sentMessages.push(payload);
      }

      close() {}
    }

    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal(
      "location",
      new URL("http://localhost:3000/") as unknown as Location
    );

    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      })
    };

    const leftPersistence = createMockWebPersistence();
    const rightPersistence = createMockWebPersistence();

    try {
      const leftRuntime = await createWebSyncoreRuntime({
        databaseName: "todos-separate-targets",
        persistenceDatabaseName: "syncore-web-test",
        persistence: leftPersistence,
        schema,
        functions,
        locateFile: () => wasmFilePath,
        platform: "browser-worker"
      });
      const rightRuntime = await createWebSyncoreRuntime({
        databaseName: "todos-separate-targets",
        persistenceDatabaseName: "syncore-web-test",
        persistence: rightPersistence,
        schema,
        functions,
        locateFile: () => wasmFilePath,
        platform: "browser-worker"
      });

      await leftRuntime.start();
      await rightRuntime.start();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const helloPayloads = sentMessages
        .filter((payload) => payload.includes('"type":"hello"'))
        .map((payload) => JSON.parse(payload) as { storageIdentity?: string });

      expect(helloPayloads).toHaveLength(2);
      expect(helloPayloads[0]?.storageIdentity).toBeDefined();
      expect(helloPayloads[1]?.storageIdentity).toBeDefined();
      expect(helloPayloads[0]?.storageIdentity).not.toBe(
        helloPayloads[1]?.storageIdentity
      );

      await leftRuntime.stop();
      await rightRuntime.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates browser runtimes with shared external change support", async () => {
    const restoreBroadcastChannel = stubBroadcastChannel();

    const schema = defineSchema({
      todos: defineTable({
        title: v.string(),
        complete: v.boolean()
      })
    });

    const functions = {
      "todos/list": query({
        args: {},
        returns: v.array(v.any()),
        handler: async (ctx) => (ctx as QueryCtx).db.query("todos").collect()
      }),
      "todos/create": mutation({
        args: { title: v.string() },
        returns: v.string(),
        handler: async (ctx, args) =>
          (ctx as MutationCtx).db.insert("todos", {
            title: (args as { title: string }).title,
            complete: false
          })
      })
    };

    const runtime = await createWebSyncoreRuntime({
      databaseName: "shared-todos",
      persistenceDatabaseName: "syncore-web-test",
      schema,
      functions,
      locateFile: () => wasmFilePath
    });

    try {
      await runtime.start();
      expect(runtime).toBeInstanceOf(SyncoreRuntime);
    } finally {
      await runtime.stop();
      restoreBroadcastChannel();
    }
  });

  it("creates explicit storage sync support objects", async () => {
    const restoreBroadcastChannel = stubBroadcastChannel();
    const persistence = new SyncoreIndexedDbPersistence({
      databaseName: "syncore-web-test"
    });
    const secondDriver = await SqlJsDriver.create({
      databaseName: "storage-sync",
      persistence,
      locateFile: () => wasmFilePath
    });
    const firstSignal = new BroadcastChannelExternalChangeSignal({
      channelName: "syncore:test:storage"
    });
    const secondSignal = new BroadcastChannelExternalChangeSignal({
      channelName: "syncore:test:storage"
    });
    const runtime = new SyncoreRuntime({
      schema: storageSchema,
      functions: storageFunctions,
      driver: secondDriver,
      storage: new BrowserFileStorageAdapter(persistence, "storage-sync"),
      externalChangeSignal: secondSignal,
      externalChangeApplier: new SqlJsExternalChangeApplier({
        databaseName: "storage-sync",
        persistence,
        createDatabase: (bytes) => secondDriver.createDatabaseFromBytes(bytes),
        replaceDatabase: (database) => secondDriver.replaceDatabase(database)
      })
    });

    try {
      await runtime.start();
      expect(runtime).toBeInstanceOf(SyncoreRuntime);
    } finally {
      await runtime.stop();
      firstSignal.close();
      secondSignal.close();
      restoreBroadcastChannel();
    }
  });
});

async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(
        request.error ??
          new Error(
            `Failed to delete IndexedDB database ${JSON.stringify(name)}.`
          )
      );
    request.onblocked = () => resolve();
  });
}

function stubBroadcastChannel(): () => void {
  const channels = new Map<
    string,
    Set<(event: MessageEvent<unknown>) => void>
  >();

  class MockBroadcastChannel {
    readonly name: string;

    constructor(name: string) {
      this.name = name;
      if (!channels.has(name)) {
        channels.set(name, new Set());
      }
    }

    addEventListener(
      type: "message",
      listener: (event: MessageEvent<unknown>) => void
    ) {
      if (type === "message") {
        channels.get(this.name)?.add(listener);
      }
    }

    removeEventListener(
      type: "message",
      listener: (event: MessageEvent<unknown>) => void
    ) {
      if (type === "message") {
        channels.get(this.name)?.delete(listener);
      }
    }

    postMessage(message: unknown) {
      const listeners = [...(channels.get(this.name) ?? [])];
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener({ data: message } as MessageEvent<unknown>);
        }
      });
    }

    close() {}
  }

  vi.stubGlobal(
    "BroadcastChannel",
    MockBroadcastChannel as unknown as typeof BroadcastChannel
  );

  return () => {
    vi.unstubAllGlobals();
  };
}

function createMockWebPersistence(): SyncoreWebPersistence {
  const databases = new Map<string, Uint8Array>();
  const files = new Map<
    string,
    { bytes: Uint8Array; contentType: string | null }
  >();

  return {
    storageProtocol: "opfs",
    async loadDatabase(key: string) {
      return databases.get(key) ?? null;
    },
    async saveDatabase(key: string, bytes: Uint8Array) {
      databases.set(key, bytes.slice());
    },
    async getFile(namespace: string, id: string) {
      const record = files.get(`${namespace}:${id}`);
      if (!record) {
        return null;
      }
      return {
        id,
        bytes: record.bytes.slice(),
        contentType: record.contentType,
        size: record.bytes.byteLength
      };
    },
    async putFile(
      namespace: string,
      id: string,
      bytes: Uint8Array,
      contentType: string | null
    ) {
      files.set(`${namespace}:${id}`, {
        bytes: bytes.slice(),
        contentType
      });
    },
    async deleteFile(namespace: string, id: string) {
      files.delete(`${namespace}:${id}`);
    },
    async listFiles(namespace: string) {
      const prefix = `${namespace}:`;
      return [...files.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, record]) => ({
          id: key.slice(prefix.length),
          bytes: record.bytes.slice(),
          contentType: record.contentType,
          size: record.bytes.byteLength
        }));
    }
  };
}
