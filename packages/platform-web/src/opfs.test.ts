import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFunctionReference,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx
} from "@syncore/core";
import { defineSchema, defineTable, v } from "@syncore/schema";
import { createWebPersistence } from "./persistence.js";
import { createWebSyncoreRuntime } from "./index.js";

const wasmFilePath = path.resolve(
  process.cwd(),
  "node_modules/sql.js/dist/sql-wasm.wasm"
);

describe("platform-web OPFS persistence", () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    installMockOpfs();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  });

  it("persists sqlite state into OPFS between runtime instances", async () => {
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
      persistenceMode: "opfs",
      opfsRootDirectoryName: "syncore-opfs-test",
      schema,
      functions,
      locateFile: () => wasmFilePath
    });
    await firstRuntime.start();
    await firstRuntime
      .createClient()
      .mutation(createFunctionReference("mutation", "todos/create"), {
        title: "Persist me in OPFS"
      });
    await firstRuntime.stop();

    const secondRuntime = await createWebSyncoreRuntime({
      databaseName: "todos",
      persistenceMode: "opfs",
      opfsRootDirectoryName: "syncore-opfs-test",
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
    expect(rows[0]?.title).toBe("Persist me in OPFS");
    await secondRuntime.stop();
  });

  it("stores file blobs and metadata in OPFS", async () => {
    const persistence = await createWebPersistence({
      mode: "opfs",
      opfsRootDirectoryName: "syncore-opfs-files"
    });

    await persistence.putFile(
      "notes",
      "file-1",
      new TextEncoder().encode("hello opfs"),
      "text/plain"
    );

    const file = await persistence.getFile("notes", "file-1");
    expect(file?.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(file?.bytes)).toBe("hello opfs");

    await persistence.deleteFile("notes", "file-1");
    expect(await persistence.getFile("notes", "file-1")).toBeNull();
  });
});

function installMockOpfs(): void {
  const navigatorValue = originalNavigatorWithStorage(
    new MockDirectoryHandle("root")
  );
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: navigatorValue
  });
}

function originalNavigatorWithStorage(
  rootDirectory: MockDirectoryHandle
): Navigator {
  return {
    ...(globalThis.navigator ?? {}),
    storage: {
      ...(globalThis.navigator?.storage ?? {}),
      getDirectory: async () =>
        rootDirectory as unknown as FileSystemDirectoryHandle
    }
  } as unknown as Navigator;
}

class MockDirectoryHandle {
  readonly kind = "directory" as const;
  private readonly directories = new Map<string, MockDirectoryHandle>();
  private readonly files = new Map<string, Uint8Array>();

  constructor(readonly name: string) {}

  async getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions
  ): Promise<FileSystemDirectoryHandle> {
    const existing = this.directories.get(name);
    if (existing) {
      return existing as unknown as FileSystemDirectoryHandle;
    }
    if (!options?.create) {
      throw createNotFoundError(`Directory "${name}" does not exist.`);
    }
    const created = new MockDirectoryHandle(name);
    this.directories.set(name, created);
    return created as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(
    name: string,
    options?: FileSystemGetFileOptions
  ): Promise<FileSystemFileHandle> {
    if (this.files.has(name)) {
      return new MockFileHandle(name, this) as unknown as FileSystemFileHandle;
    }
    if (!options?.create) {
      throw createNotFoundError(`File "${name}" does not exist.`);
    }
    this.files.set(name, new Uint8Array());
    return new MockFileHandle(name, this) as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string): Promise<void> {
    if (this.files.delete(name) || this.directories.delete(name)) {
      return;
    }
    throw createNotFoundError(`Entry "${name}" does not exist.`);
  }

  readFile(name: string): Uint8Array {
    const bytes = this.files.get(name);
    if (!bytes) {
      throw createNotFoundError(`File "${name}" does not exist.`);
    }
    return bytes;
  }

  writeFile(name: string, bytes: Uint8Array): void {
    this.files.set(name, bytes);
  }
}

class MockFileHandle {
  readonly kind = "file" as const;

  constructor(
    readonly name: string,
    private readonly parent: MockDirectoryHandle
  ) {}

  async createWritable(): Promise<FileSystemWritableFileStream> {
    let pending = this.parent.readFile(this.name);

    return {
      write: async (data: FileSystemWriteChunkType) => {
        pending = await normalizeChunk(data);
      },
      truncate: async (size: number) => {
        pending = pending.slice(0, size);
      },
      close: async () => {
        this.parent.writeFile(this.name, pending);
      }
    } as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    const bytes = this.parent.readFile(this.name);
    return {
      size: bytes.byteLength,
      arrayBuffer: async () => sliceToArrayBuffer(bytes)
    } as File;
  }
}

async function normalizeChunk(chunk: unknown): Promise<Uint8Array> {
  if (chunk === null) {
    return new Uint8Array();
  }
  if (typeof chunk === "string") {
    return new TextEncoder().encode(chunk);
  }
  if (chunk instanceof Uint8Array) {
    return chunk;
  }
  if (ArrayBuffer.isView(chunk)) {
    return new Uint8Array(
      chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)
    );
  }
  if (chunk instanceof ArrayBuffer) {
    return new Uint8Array(chunk);
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    chunk instanceof SharedArrayBuffer
  ) {
    return new Uint8Array(chunk.slice(0));
  }
  if (chunk instanceof Blob) {
    return new Uint8Array(await chunk.arrayBuffer());
  }
  if (Array.isArray(chunk)) {
    return Uint8Array.from(
      chunk.filter((value): value is number => typeof value === "number")
    );
  }
  if (chunk && typeof chunk === "object" && "data" in chunk) {
    return normalizeChunk(chunk.data);
  }
  if (
    chunk &&
    typeof chunk === "object" &&
    "byteLength" in chunk &&
    typeof chunk.byteLength === "number"
  ) {
    try {
      return new Uint8Array(chunk as ArrayBufferLike);
    } catch {
      if (
        "buffer" in chunk &&
        "byteOffset" in chunk &&
        typeof chunk.byteOffset === "number"
      ) {
        const view = chunk as {
          buffer: ArrayBufferLike;
          byteOffset: number;
          byteLength: number;
        };
        return new Uint8Array(
          view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)
        );
      }
    }
  }
  throw new Error(
    `Unsupported OPFS write chunk in test: ${Object.prototype.toString.call(chunk)}`
  );
}

function createNotFoundError(message: string): Error {
  return Object.assign(new Error(message), { name: "NotFoundError" });
}

function sliceToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
