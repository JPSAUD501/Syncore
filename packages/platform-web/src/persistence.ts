import { SyncoreIndexedDbPersistence } from "./indexeddb.js";
import { SyncoreOpfsPersistence } from "./opfs.js";

export interface StoredWebFile {
  id: string;
  bytes: Uint8Array;
  contentType: string | null;
  size: number;
}

export interface SyncoreWebPersistence {
  readonly storageProtocol: "idb" | "opfs";
  loadDatabase(key: string): Promise<Uint8Array | null>;
  saveDatabase(key: string, bytes: Uint8Array): Promise<void>;
  getFile(namespace: string, id: string): Promise<StoredWebFile | null>;
  putFile(
    namespace: string,
    id: string,
    bytes: Uint8Array,
    contentType: string | null
  ): Promise<void>;
  deleteFile(namespace: string, id: string): Promise<void>;
  listFiles(namespace: string): Promise<StoredWebFile[]>;
}

export type WebPersistenceMode = "auto" | "indexeddb" | "opfs";

export interface CreateWebPersistenceOptions {
  mode?: WebPersistenceMode;
  indexedDbDatabaseName?: string;
  opfsRootDirectoryName?: string;
}

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
