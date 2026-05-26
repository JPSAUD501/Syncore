import type {
  StorageObject,
  SyncoreSqlDriver,
  SyncoreStorageAdapter,
  SyncoreStorageApi,
  StorageWriteInput
} from "../../runtime.js";
import type { StorageEntry } from "@syncore/devtools-protocol";
import {
  type DevtoolsEventMeta,
  type RuntimeExecutionState,
  type StorageMetadataRow,
  type StoragePendingRow
} from "./shared.js";
import { DevtoolsEngine } from "./devtoolsEngine.js";
import { generateId } from "../../id.js";

type StorageEngineDeps = {
  driver: SyncoreSqlDriver;
  storage: SyncoreStorageAdapter;
  runtimeId: string;
  devtools: DevtoolsEngine;
};

const STORAGE_RANGE_FALLBACK_LIMIT_BYTES = 8 * 1024 * 1024;

export class StorageEngine {
  constructor(private readonly deps: StorageEngineDeps) {}

  async prepare(): Promise<void> {
    await this.deps.driver.exec(`
      CREATE TABLE IF NOT EXISTS "_storage" (
        _id TEXT PRIMARY KEY,
        _creationTime INTEGER NOT NULL,
        file_name TEXT,
        content_type TEXT,
        size INTEGER NOT NULL,
        path TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "_storage_pending" (
        _id TEXT PRIMARY KEY,
        _creationTime INTEGER NOT NULL,
        file_name TEXT,
        content_type TEXT
      );
    `);
  }

  async reconcile(): Promise<void> {
    const pendingRows = await this.deps.driver.all<StoragePendingRow>(
      `SELECT _id, _creationTime, file_name, content_type FROM "_storage_pending"`
    );

    for (const pendingRow of pendingRows) {
      const committed = await this.deps.driver.get<
        Pick<StorageMetadataRow, "_id">
      >(`SELECT _id FROM "_storage" WHERE _id = ?`, [pendingRow._id]);
      if (!committed) {
        await this.deps.storage.delete(pendingRow._id);
        this.deps.devtools.emit({
          type: "log",
          runtimeId: this.deps.runtimeId,
          level: "warn",
          message: `Recovered interrupted storage write ${pendingRow._id}.`,
          timestamp: Date.now()
        });
      }
      await this.deps.driver.run(
        `DELETE FROM "_storage_pending" WHERE _id = ?`,
        [pendingRow._id]
      );
    }

    if (!this.deps.storage.list) {
      return;
    }

    const storedRows = await this.deps.driver.all<
      Pick<StorageMetadataRow, "_id">
    >(`SELECT _id FROM "_storage"`);
    const knownIds = new Set(storedRows.map((row) => row._id));
    const physicalObjects = await this.deps.storage.list();
    for (const object of physicalObjects) {
      if (knownIds.has(object.id)) {
        continue;
      }
      await this.deps.storage.delete(object.id);
      this.deps.devtools.emit({
        type: "log",
        runtimeId: this.deps.runtimeId,
        level: "warn",
        message: `Removed orphaned storage object ${object.id}.`,
        timestamp: Date.now()
      });
    }
  }

  async listObjects(
    options: {
      limit?: number;
      offset?: number;
      search?: string;
    } = {}
  ): Promise<{ entries: StorageEntry[]; totalCount: number }> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
    const offset = Math.max(options.offset ?? 0, 0);
    const search = options.search?.trim();
    const params: unknown[] = [];
    const whereClauses: string[] = [];

    if (search) {
      const pattern = `%${search}%`;
      whereClauses.push(
        `(_id LIKE ? OR file_name LIKE ? OR content_type LIKE ?)`
      );
      params.push(pattern, pattern, pattern);
    }

    const whereSql =
      whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
    const rows = await this.deps.driver.all<StorageMetadataRow>(
      `SELECT _id, _creationTime, file_name, content_type, size, path FROM "_storage"${whereSql} ORDER BY _creationTime DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const countRow = await this.deps.driver.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM "_storage"${whereSql}`,
      params
    );

    return {
      entries: rows.map(storageEntryFromRow),
      totalCount: countRow?.count ?? 0
    };
  }

  async getObjectAccessInfo(
    id: string
  ): Promise<{ entry: StorageEntry; supportsRange: boolean } | null> {
    const row = await this.deps.driver.get<StorageMetadataRow>(
      `SELECT _id, _creationTime, file_name, content_type, size, path FROM "_storage" WHERE _id = ?`,
      [id]
    );
    if (!row) {
      return null;
    }
    return {
      entry: storageEntryFromRow(row),
      supportsRange: storageSupportsRange(this.deps.storage)
    };
  }

  async readObjectRange(
    id: string,
    offset: number,
    length: number
  ): Promise<{
    entry: StorageEntry;
    bytes: Uint8Array;
    offset: number;
    bytesRead: number;
    done: boolean;
    supportsRange: boolean;
  } | null> {
    const row = await this.deps.driver.get<StorageMetadataRow>(
      `SELECT _id, _creationTime, file_name, content_type, size, path FROM "_storage" WHERE _id = ?`,
      [id]
    );
    if (!row) {
      return null;
    }

    const normalizedOffset = Math.max(Math.floor(offset), 0);
    const normalizedLength = Math.max(Math.floor(length), 0);
    const entry = storageEntryFromRow(row);
    const supportsRange = storageSupportsRange(this.deps.storage);
    if (normalizedLength === 0) {
      return {
        entry,
        bytes: new Uint8Array(),
        offset: normalizedOffset,
        bytesRead: 0,
        done: normalizedOffset >= row.size,
        supportsRange
      };
    }

    let bytes: Uint8Array | null;
    if (supportsRange && this.deps.storage.readRange) {
      bytes = await this.deps.storage.readRange(
        id,
        normalizedOffset,
        normalizedLength
      );
    } else {
      if (row.size > STORAGE_RANGE_FALLBACK_LIMIT_BYTES) {
        throw new Error(
          "This storage backend does not support ranged reads for large files."
        );
      }
      const fullBytes = await this.deps.storage.read(id);
      bytes = fullBytes
        ? fullBytes.slice(normalizedOffset, normalizedOffset + normalizedLength)
        : null;
    }
    if (!bytes) {
      return null;
    }
    return {
      entry,
      bytes,
      offset: normalizedOffset,
      bytesRead: bytes.byteLength,
      done: normalizedOffset + bytes.byteLength >= row.size,
      supportsRange
    };
  }

  async deleteObject(
    id: string,
    meta: DevtoolsEventMeta = {}
  ): Promise<boolean> {
    const row = await this.deps.driver.get<Pick<StorageMetadataRow, "_id">>(
      `SELECT _id FROM "_storage" WHERE _id = ?`,
      [id]
    );
    if (!row) {
      return false;
    }
    await this.deleteCommittedObject(id, undefined, meta);
    return true;
  }

  createStorageApi(state: RuntimeExecutionState): SyncoreStorageApi {
    const componentMetadata = state.componentMetadata;
    const namespacePrefix = componentMetadata
      ? `component:${componentMetadata.componentPath}:`
      : "";
    const ensureStorageCapability = () => {
      if (
        componentMetadata &&
        !componentMetadata.grantedCapabilities.includes("storage")
      ) {
        throw new Error(
          `Component ${JSON.stringify(componentMetadata.componentPath)} is not allowed to use storage.`
        );
      }
    };
    const scopedId = (id: string) => `${namespacePrefix}${id}`;

    return {
      put: async (input: StorageWriteInput) => {
        ensureStorageCapability();
        const id = scopedId(generateId());
        const createdAt = Date.now();
        await this.deps.driver.run(
          `INSERT OR REPLACE INTO "_storage_pending" (_id, _creationTime, file_name, content_type) VALUES (?, ?, ?, ?)`,
          [id, createdAt, input.fileName ?? null, input.contentType ?? null]
        );
        const object = await this.deps.storage.put(id, input);
        await this.deps.driver.withTransaction(async () => {
          await this.deps.driver.run(
            `INSERT OR REPLACE INTO "_storage" (_id, _creationTime, file_name, content_type, size, path) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              id,
              createdAt,
              input.fileName ?? null,
              object.contentType,
              object.size,
              object.path
            ]
          );
          await this.deps.driver.run(
            `DELETE FROM "_storage_pending" WHERE _id = ?`,
            [id]
          );
        });
        this.deps.devtools.emit({
          type: "storage.updated",
          runtimeId: this.deps.runtimeId,
          storageId: id,
          ...(componentMetadata
            ? { componentPath: componentMetadata.componentPath }
            : {}),
          operation: "put",
          timestamp: Date.now()
        });
        state.storageChanges.push({
          storageId: id,
          reason: "storage-put"
        });
        return id;
      },
      get: async (id: string): Promise<StorageObject | null> => {
        ensureStorageCapability();
        state.dependencyCollector?.add(`storage:${id}`);
        const row = await this.deps.driver.get<StorageMetadataRow>(
          `SELECT _id, _creationTime, file_name, content_type, size, path FROM "_storage" WHERE _id = ?`,
          [id]
        );
        if (!row) {
          return null;
        }
        return {
          id: row._id,
          path: row.path,
          size: row.size,
          contentType: row.content_type
        };
      },
      read: async (id: string) => {
        ensureStorageCapability();
        state.dependencyCollector?.add(`storage:${id}`);
        const row = await this.deps.driver.get<Pick<StorageMetadataRow, "_id">>(
          `SELECT _id FROM "_storage" WHERE _id = ?`,
          [id]
        );
        if (!row) {
          return null;
        }
        return this.deps.storage.read(id);
      },
      delete: async (id: string) => {
        ensureStorageCapability();
        await this.deleteCommittedObject(id, componentMetadata?.componentPath);
        state.storageChanges.push({
          storageId: id,
          reason: "storage-delete"
        });
      }
    };
  }

  private async deleteCommittedObject(
    id: string,
    componentPath?: string,
    meta: DevtoolsEventMeta = {}
  ): Promise<void> {
    await this.deps.storage.delete(id);
    await this.deps.driver.withTransaction(async () => {
      await this.deps.driver.run(`DELETE FROM "_storage" WHERE _id = ?`, [id]);
      await this.deps.driver.run(
        `DELETE FROM "_storage_pending" WHERE _id = ?`,
        [id]
      );
    });
    this.deps.devtools.emit({
      type: "storage.updated",
      runtimeId: this.deps.runtimeId,
      storageId: id,
      ...(componentPath ? { componentPath } : {}),
      operation: "delete",
      timestamp: Date.now(),
      ...(meta.origin ? { origin: meta.origin } : {})
    });
  }
}

function storageEntryFromRow(row: StorageMetadataRow): StorageEntry {
  return {
    id: row._id,
    createdAt: row._creationTime,
    ...(row.file_name ? { fileName: row.file_name } : {}),
    ...(row.content_type ? { contentType: row.content_type } : {}),
    size: row.size,
    path: row.path
  };
}

function storageSupportsRange(storage: SyncoreStorageAdapter): boolean {
  return Boolean(storage.readRange) && storage.supportsRange?.() !== false;
}
