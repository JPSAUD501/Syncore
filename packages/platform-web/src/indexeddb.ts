import type { SyncoreWebPersistence, StoredWebFile } from "./persistence.js";

export interface IndexedDbPersistenceOptions {
  databaseName?: string;
}

type StoredDatabaseRecord = {
  key: string;
  bytes: ArrayBuffer;
  updatedAt: number;
};

type StoredFileRecord = {
  key: string;
  bytes: ArrayBuffer;
  contentType: string | null;
  size: number;
  updatedAt: number;
};

export class SyncoreIndexedDbPersistence implements SyncoreWebPersistence {
  readonly storageProtocol = "idb" as const;
  private readonly databaseName: string;

  constructor(options?: IndexedDbPersistenceOptions) {
    this.databaseName = options?.databaseName ?? "syncore-web";
  }

  async loadDatabase(key: string): Promise<Uint8Array | null> {
    const record = await this.getRecord<StoredDatabaseRecord>("databases", key);
    if (!record) {
      return null;
    }
    return new Uint8Array(record.bytes);
  }

  async saveDatabase(key: string, bytes: Uint8Array): Promise<void> {
    await this.putRecord<StoredDatabaseRecord>("databases", {
      key,
      bytes: sliceToArrayBuffer(bytes),
      updatedAt: Date.now()
    });
  }

  async getFile(
    namespace: string,
    id: string
  ): Promise<StoredWebFile | null> {
    const record = await this.getRecord<StoredFileRecord>(
      "files",
      createNamespacedKey(namespace, id)
    );
    if (!record) {
      return null;
    }
    return {
      id,
      bytes: new Uint8Array(record.bytes),
      contentType: record.contentType,
      size: record.size
    };
  }

  async putFile(
    namespace: string,
    id: string,
    bytes: Uint8Array,
    contentType: string | null
  ): Promise<void> {
    await this.putRecord<StoredFileRecord>("files", {
      key: createNamespacedKey(namespace, id),
      bytes: sliceToArrayBuffer(bytes),
      contentType,
      size: bytes.byteLength,
      updatedAt: Date.now()
    });
  }

  async deleteFile(namespace: string, id: string): Promise<void> {
    await this.deleteRecord("files", createNamespacedKey(namespace, id));
  }

  async listFiles(namespace: string): Promise<StoredWebFile[]> {
    const prefix = `${namespace}:`;
    const records = await this.listRecords<StoredFileRecord>("files");
    return records
      .filter((record) => record.key.startsWith(prefix))
      .map((record) => ({
        id: record.key.slice(prefix.length),
        bytes: new Uint8Array(record.bytes),
        contentType: record.contentType,
        size: record.size
      }));
  }

  private async getDatabase(): Promise<IDBDatabase> {
    const indexedDb = globalThis.indexedDB;
    if (!indexedDb) {
      throw new Error("IndexedDB is not available in this environment.");
    }

    return new Promise((resolve, reject) => {
      const request = indexedDb.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("databases")) {
          database.createObjectStore("databases", { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains("files")) {
          database.createObjectStore("files", { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
  }

  private async getRecord<TRecord>(
    storeName: "databases" | "files",
    key: string
  ): Promise<TRecord | null> {
    const database = await this.getDatabase();
    try {
      return await new Promise<TRecord | null>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(key);
        request.onsuccess = () => resolve((request.result as TRecord | undefined) ?? null);
        request.onerror = () =>
          reject(request.error ?? new Error(`Failed to read ${storeName}/${key}.`));
      });
    } finally {
      database.close();
    }
  }

  private async putRecord<TRecord extends { key: string }>(
    storeName: "databases" | "files",
    record: TRecord
  ): Promise<void> {
    const database = await this.getDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error(`Failed to write ${storeName}/${record.key}.`));
        transaction.objectStore(storeName).put(record);
      });
    } finally {
      database.close();
    }
  }

  private async deleteRecord(
    storeName: "databases" | "files",
    key: string
  ): Promise<void> {
    const database = await this.getDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
          reject(transaction.error ?? new Error(`Failed to delete ${storeName}/${key}.`));
        transaction.objectStore(storeName).delete(key);
      });
    } finally {
      database.close();
    }
  }

  private async listRecords<TRecord>(
    storeName: "databases" | "files"
  ): Promise<TRecord[]> {
    const database = await this.getDatabase();
    try {
      return await new Promise<TRecord[]>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve((request.result as TRecord[] | undefined) ?? []);
        request.onerror = () =>
          reject(request.error ?? new Error(`Failed to list records from ${storeName}.`));
      });
    } finally {
      database.close();
    }
  }
}

function createNamespacedKey(namespace: string, id: string): string {
  return `${namespace}:${id}`;
}

function sliceToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
