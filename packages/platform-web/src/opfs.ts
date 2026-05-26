import type {
  SyncoreWebPersistence,
  StoredWebFile,
  StoredWebFileMetadata,
  StoredWebFileRange
} from "./persistence.js";

/** Options for constructing a {@link SyncoreOpfsPersistence}. */
export interface OpfsPersistenceOptions {
  /** Root directory name inside the Origin Private File System bucket. Defaults to `"syncore"`. */
  rootDirectoryName?: string;
}

type StoredFileMetadata = {
  contentType: string | null;
};

type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

/**
 * Origin Private File System (OPFS) backed {@link SyncoreWebPersistence}.
 *
 * Stores the SQLite database blob as a `.sqlite` file and binary file objects
 * as individual OPFS entries under a configurable root directory. OPFS offers
 * significantly better I/O throughput than IndexedDB and is the preferred
 * persistence backend when available.
 *
 * Used automatically by `createWebPersistence()` in `"opfs"` or `"auto"` mode
 * when `isOpfsAvailable()` returns `true`.
 */
export class SyncoreOpfsPersistence implements SyncoreWebPersistence {
  readonly storageProtocol = "opfs" as const;
  private rootDirectoryPromise: Promise<FileSystemDirectoryHandle> | undefined;

  constructor(private readonly options: OpfsPersistenceOptions = {}) {}

  async loadDatabase(key: string): Promise<Uint8Array | null> {
    const handle = await this.getOptionalFileHandle(
      ["databases"],
      `${encodePathComponent(key)}.sqlite`
    );
    if (!handle) {
      return null;
    }
    return readFileBytes(handle);
  }

  async saveDatabase(key: string, bytes: Uint8Array): Promise<void> {
    const directory = await this.ensureDirectory(["databases"]);
    await writeBytes(
      await directory.getFileHandle(`${encodePathComponent(key)}.sqlite`, {
        create: true
      }),
      bytes
    );
  }

  async getFile(namespace: string, id: string): Promise<StoredWebFile | null> {
    const directory = await this.getOptionalDirectory([
      "files",
      encodePathComponent(namespace)
    ]);
    if (!directory) {
      return null;
    }

    const fileName = `${encodePathComponent(id)}.bin`;
    const metadataName = `${encodePathComponent(id)}.meta.json`;
    const fileHandle = await this.getOptionalFileHandleFromDirectory(
      directory,
      fileName
    );
    if (!fileHandle) {
      return null;
    }

    const [bytes, metadata] = await Promise.all([
      readFileBytes(fileHandle),
      this.readMetadata(directory, metadataName)
    ]);

    return {
      id,
      bytes,
      size: bytes.byteLength,
      contentType: metadata?.contentType ?? null
    };
  }

  async getFileRange(
    namespace: string,
    id: string,
    offset: number,
    length: number
  ): Promise<StoredWebFileRange | null> {
    const directory = await this.getOptionalDirectory([
      "files",
      encodePathComponent(namespace)
    ]);
    if (!directory) {
      return null;
    }

    const encodedId = encodePathComponent(id);
    const fileHandle = await this.getOptionalFileHandleFromDirectory(
      directory,
      `${encodedId}.bin`
    );
    if (!fileHandle) {
      return null;
    }

    const [file, metadata] = await Promise.all([
      fileHandle.getFile(),
      this.readMetadata(directory, `${encodedId}.meta.json`)
    ]);
    const normalizedOffset = Math.max(offset, 0);
    const normalizedLength = Math.max(length, 0);
    const slice = file.slice(
      normalizedOffset,
      normalizedOffset + normalizedLength
    );
    return {
      id,
      bytes: new Uint8Array(await slice.arrayBuffer()),
      size: file.size,
      contentType: metadata?.contentType ?? null,
      offset: normalizedOffset
    };
  }

  async putFile(
    namespace: string,
    id: string,
    bytes: Uint8Array,
    contentType: string | null
  ): Promise<void> {
    const directory = await this.ensureDirectory([
      "files",
      encodePathComponent(namespace)
    ]);
    const encodedId = encodePathComponent(id);

    await writeBytes(
      await directory.getFileHandle(`${encodedId}.bin`, { create: true }),
      bytes
    );
    await writeText(
      await directory.getFileHandle(`${encodedId}.meta.json`, { create: true }),
      JSON.stringify({ contentType } satisfies StoredFileMetadata)
    );
  }

  async deleteFile(namespace: string, id: string): Promise<void> {
    const directory = await this.getOptionalDirectory([
      "files",
      encodePathComponent(namespace)
    ]);
    if (!directory) {
      return;
    }

    const encodedId = encodePathComponent(id);
    await removeEntryIfExists(directory, `${encodedId}.bin`);
    await removeEntryIfExists(directory, `${encodedId}.meta.json`);
  }

  async listFiles(namespace: string): Promise<StoredWebFile[]> {
    const metadata = await this.listFileMetadata(namespace);
    return Promise.all(
      metadata.map(async (file) => {
        const fullFile = await this.getFile(namespace, file.id);
        return fullFile ?? { ...file, bytes: new Uint8Array() };
      })
    );
  }

  async listFileMetadata(namespace: string): Promise<StoredWebFileMetadata[]> {
    const directory = await this.getOptionalDirectory([
      "files",
      encodePathComponent(namespace)
    ]);
    if (!directory) {
      return [];
    }

    const files: StoredWebFileMetadata[] = [];
    const iterableDirectory = directory as FileSystemDirectoryHandle & {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    };
    for await (const [name, handle] of iterableDirectory.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".bin")) {
        continue;
      }
      const encodedId = name.slice(0, -4);
      const id = decodeURIComponent(encodedId);
      const file = await (handle as FileSystemFileHandle).getFile();
      const metadata = await this.readMetadata(
        directory,
        `${encodedId}.meta.json`
      );
      files.push({
        id,
        size: file.size,
        contentType: metadata?.contentType ?? null
      });
    }
    return files;
  }

  private async ensureDirectory(
    pathSegments: string[]
  ): Promise<FileSystemDirectoryHandle> {
    let directory = await this.getRootDirectory();
    for (const segment of pathSegments) {
      directory = await directory.getDirectoryHandle(segment, { create: true });
    }
    return directory;
  }

  private async getOptionalDirectory(
    pathSegments: string[]
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      let directory = await this.getRootDirectory();
      for (const segment of pathSegments) {
        directory = await directory.getDirectoryHandle(segment);
      }
      return directory;
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async getOptionalFileHandle(
    pathSegments: string[],
    fileName: string
  ): Promise<FileSystemFileHandle | null> {
    const directory = await this.getOptionalDirectory(pathSegments);
    if (!directory) {
      return null;
    }
    return this.getOptionalFileHandleFromDirectory(directory, fileName);
  }

  private async getOptionalFileHandleFromDirectory(
    directory: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<FileSystemFileHandle | null> {
    try {
      return await directory.getFileHandle(fileName);
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async readMetadata(
    directory: FileSystemDirectoryHandle,
    fileName: string
  ): Promise<StoredFileMetadata | null> {
    const handle = await this.getOptionalFileHandleFromDirectory(
      directory,
      fileName
    );
    if (!handle) {
      return null;
    }

    const bytes = await readFileBytes(handle);
    return JSON.parse(new TextDecoder().decode(bytes)) as StoredFileMetadata;
  }

  private async getRootDirectory(): Promise<FileSystemDirectoryHandle> {
    if (!this.rootDirectoryPromise) {
      this.rootDirectoryPromise = (async () => {
        const storageManager = getOpfsStorageManager();
        if (!storageManager?.getDirectory) {
          throw new Error("OPFS is not available in this environment.");
        }
        const root = await storageManager.getDirectory();
        return root.getDirectoryHandle(
          this.options.rootDirectoryName ?? "syncore",
          { create: true }
        );
      })();
    }
    return this.rootDirectoryPromise;
  }
}

async function readFileBytes(
  handle: FileSystemFileHandle
): Promise<Uint8Array> {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

async function writeBytes(
  handle: FileSystemFileHandle,
  bytes: Uint8Array
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(sliceToArrayBuffer(bytes));
    await writable.truncate(bytes.byteLength);
  } finally {
    await writable.close();
  }
}

async function writeText(
  handle: FileSystemFileHandle,
  value: string
): Promise<void> {
  await writeBytes(handle, new TextEncoder().encode(value));
}

async function removeEntryIfExists(
  directory: FileSystemDirectoryHandle,
  name: string
): Promise<void> {
  try {
    await directory.removeEntry(name);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

function encodePathComponent(value: string): string {
  return encodeURIComponent(value);
}

function sliceToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function getOpfsStorageManager(): OpfsStorageManager | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.storage as OpfsStorageManager | undefined;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotFoundError"
  );
}
