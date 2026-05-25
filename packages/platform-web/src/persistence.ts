import { SyncoreIndexedDbPersistence } from "./indexeddb.js";
import { SyncoreOpfsPersistence } from "./opfs.js";

/**
 * A binary file record stored in web persistence (OPFS or IndexedDB).
 * Returned by `SyncoreWebPersistence.getFile` and `listFiles`.
 */
export interface StoredWebFile {
  /** Unique file identifier within its namespace. */
  id: string;
  /** Raw file bytes. */
  bytes: Uint8Array;
  /** MIME type, or `null` if none was recorded at write time. */
  contentType: string | null;
  /** File size in bytes. */
  size: number;
}

/**
 * Abstraction over browser storage backends (OPFS or IndexedDB).
 *
 * Handles both the SQLite database blob and binary file objects. All
 * implementations must persist data across page reloads.
 *
 * The concrete implementation is chosen by `createWebPersistence` based on
 * browser capabilities and the requested `WebPersistenceMode`.
 */
export interface SyncoreWebPersistence {
  /** The storage protocol used: `"opfs"` (Origin Private File System) or `"idb"` (IndexedDB). */
  readonly storageProtocol: "idb" | "opfs";
  /** Load the serialized SQLite database for `key`, or `null` if none has been saved yet. */
  loadDatabase(key: string): Promise<Uint8Array | null>;
  /** Persist the serialized SQLite database bytes for `key`. */
  saveDatabase(key: string, bytes: Uint8Array): Promise<void>;
  /** Retrieve a stored file from `namespace` by `id`, or `null` if not found. */
  getFile(namespace: string, id: string): Promise<StoredWebFile | null>;
  /** Write a file into `namespace` under `id`, replacing any existing entry. */
  putFile(
    namespace: string,
    id: string,
    bytes: Uint8Array,
    contentType: string | null
  ): Promise<void>;
  /** Delete a file from `namespace` by `id`. No-op if the file does not exist. */
  deleteFile(namespace: string, id: string): Promise<void>;
  /** List all stored files in `namespace`. */
  listFiles(namespace: string): Promise<StoredWebFile[]>;
}

/**
 * Which browser storage backend Syncore should use for SQLite persistence.
 *
 * - `"opfs"` — Origin Private File System. Fastest option; available in
 *   Chrome 102+, Safari 15.2+, and modern Firefox. **Required** for
 *   multi-tab coordination using `SharedArrayBuffer`.
 * - `"indexeddb"` — Falls back to IndexedDB for browsers without OPFS.
 *   Slower due to serialization overhead but universally available.
 * - `"auto"` *(default)* — Picks `"opfs"` when available, otherwise
 *   `"indexeddb"`.
 */
export type WebPersistenceMode = "auto" | "indexeddb" | "opfs";

/** Options for {@link createWebPersistence}. */
export interface CreateWebPersistenceOptions {
  /** Persistence backend to use. Defaults to `"auto"`. */
  mode?: WebPersistenceMode;
  /** Custom IndexedDB database name. Defaults to the Syncore database name. */
  indexedDbDatabaseName?: string;
  /** Root directory name inside the OPFS bucket. Defaults to the Syncore database name. */
  opfsRootDirectoryName?: string;
}

/**
 * Create the appropriate web persistence backend based on browser capabilities
 * and the requested mode.
 *
 * Call this if you need a `SyncoreWebPersistence` instance outside of
 * `createWebSyncoreRuntime` (e.g. in the Expo adapter). In a standard
 * browser setup, `createWebSyncoreRuntime` calls this automatically.
 */
export async function createWebPersistence(
  options: CreateWebPersistenceOptions = {}
): Promise<SyncoreWebPersistence> {
  const mode = options.mode ?? "auto";

  if (mode === "opfs") {
    if (!isOpfsAvailable()) {
      throw new Error("OPFS is not available in this environment.");
    }
    return new SyncoreOpfsPersistence(
      options.opfsRootDirectoryName
        ? { rootDirectoryName: options.opfsRootDirectoryName }
        : undefined
    );
  }

  if (mode === "auto" && isOpfsAvailable()) {
    return new SyncoreOpfsPersistence(
      options.opfsRootDirectoryName
        ? { rootDirectoryName: options.opfsRootDirectoryName }
        : undefined
    );
  }

  return new SyncoreIndexedDbPersistence(
    options.indexedDbDatabaseName
      ? { databaseName: options.indexedDbDatabaseName }
      : undefined
  );
}

/**
 * Return `true` if the Origin Private File System API is available in the
 * current browser context.
 *
 * Used internally to decide whether to prefer OPFS over IndexedDB in `"auto"`
 * mode. Also useful in application code for displaying conditional UI.
 */
export function isOpfsAvailable(): boolean {
  return Boolean(getOpfsStorageManager()?.getDirectory);
}

type OpfsStorageManager = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

function getOpfsStorageManager(): OpfsStorageManager | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }
  return navigator.storage as OpfsStorageManager | undefined;
}
