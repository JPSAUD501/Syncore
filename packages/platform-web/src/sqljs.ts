import initSqlJs from "sql.js";
import type { RunResult, SyncoreSqlDriver } from "@syncore/core";
import { SyncoreIndexedDbPersistence } from "./indexeddb.js";
import type { SyncoreWebPersistence } from "./persistence.js";

type SqlJsDatabase = initSqlJs.Database;
type SqlJsValue = initSqlJs.SqlValue;

export interface CreateSqlJsDriverOptions {
  databaseName: string;
  persistence?: SyncoreWebPersistence;
  wasmUrl?: string;
  locateFile?: (fileName: string) => string;
}

export class SqlJsDriver implements SyncoreSqlDriver {
  private transactionDepth = 0;
  private closed = false;

  constructor(
    private database: SqlJsDatabase,
    private readonly persistence: SyncoreWebPersistence,
    private readonly databaseName: string,
    private readonly createDatabase: (bytes?: Uint8Array) => SqlJsDatabase
  ) {}

  static async create(options: CreateSqlJsDriverOptions): Promise<SqlJsDriver> {
    const persistence =
      options.persistence ?? new SyncoreIndexedDbPersistence();
    const SQL = await initSqlJs(
      typeof window === "undefined" && !options.locateFile && !options.wasmUrl
        ? undefined
        : {
            locateFile:
              options.locateFile ?? (() => options.wasmUrl ?? "/sql-wasm.wasm")
          }
    );
    const existingBytes = await persistence.loadDatabase(options.databaseName);
    const database = existingBytes
      ? new SQL.Database(existingBytes)
      : new SQL.Database();
    return new SqlJsDriver(
      database,
      persistence,
      options.databaseName,
      (bytes) => (bytes ? new SQL.Database(bytes) : new SQL.Database())
    );
  }

  async exec(sql: string): Promise<void> {
    this.ensureOpen();
    this.database.run(sql);
    await this.persistIfNeeded();
  }

  async run(sql: string, params: unknown[] = []): Promise<RunResult> {
    this.ensureOpen();
    const statement = this.database.prepare(sql);
    try {
      statement.run(normalizeParams(params));
      const lastInsertRowid = readScalarNumber(
        this.database,
        "SELECT last_insert_rowid()"
      );
      const result = {
        changes: this.database.getRowsModified(),
        ...(lastInsertRowid !== null ? { lastInsertRowid } : {})
      };
      await this.persistIfNeeded();
      return result;
    } finally {
      statement.free();
    }
  }

  async get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    this.ensureOpen();
    const statement = this.database.prepare(sql);
    try {
      statement.bind(normalizeParams(params));
      if (!statement.step()) {
        return undefined;
      }
      return statement.getAsObject() as T;
    } finally {
      statement.free();
    }
  }

  async all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    this.ensureOpen();
    const statement = this.database.prepare(sql);
    try {
      statement.bind(normalizeParams(params));
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  async withTransaction<T>(callback: () => Promise<T>): Promise<T> {
    this.ensureOpen();
    if (this.transactionDepth > 0) {
      return this.withSavepoint(`nested_${this.transactionDepth}`, callback);
    }

    this.transactionDepth += 1;
    this.database.run("BEGIN IMMEDIATE");
    try {
      const result = await callback();
      this.database.run("COMMIT");
      await this.persistNow();
      return result;
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async withSavepoint<T>(name: string, callback: () => Promise<T>): Promise<T> {
    this.ensureOpen();
    const safeName = name.replaceAll(/[^a-zA-Z0-9_]/g, "_");
    this.database.run(`SAVEPOINT ${safeName}`);
    this.transactionDepth += 1;
    try {
      const result = await callback();
      this.database.run(`RELEASE SAVEPOINT ${safeName}`);
      return result;
    } catch (error) {
      this.database.run(`ROLLBACK TO SAVEPOINT ${safeName}`);
      this.database.run(`RELEASE SAVEPOINT ${safeName}`);
      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    await this.persistNow();
    this.database.close();
    this.closed = true;
  }

  async reloadFromPersistence(): Promise<boolean> {
    this.ensureOpen();
    const bytes = await this.persistence.loadDatabase(this.databaseName);
    if (!bytes) {
      return false;
    }
    const nextDatabase = this.createDatabase(bytes);
    const previousDatabase = this.database;
    this.database = nextDatabase;
    previousDatabase.close();
    return true;
  }

  createDatabaseFromBytes(bytes?: Uint8Array): SqlJsDatabase {
    return this.createDatabase(bytes);
  }

  private async persistIfNeeded(): Promise<void> {
    if (this.transactionDepth === 0) {
      await this.persistNow();
    }
  }

  private async persistNow(): Promise<void> {
    this.ensureOpen();
    await this.persistence.saveDatabase(
      this.databaseName,
      this.database.export()
    );
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error("The sql.js driver is already closed.");
    }
  }

  replaceDatabase(database: SqlJsDatabase): void {
    this.ensureOpen();
    const previousDatabase = this.database;
    this.database = database;
    previousDatabase.close();
  }
}

function normalizeParams(values: unknown[]): SqlJsValue[] {
  return values.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "string" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return JSON.stringify(value);
  });
}

function readScalarNumber(database: SqlJsDatabase, sql: string): number | null {
  const rows = database.exec(sql);
  const firstSet = rows[0];
  const firstRow = firstSet?.values[0];
  const firstValue = firstRow?.[0];
  if (typeof firstValue === "number") {
    return firstValue;
  }
  if (typeof firstValue === "string") {
    const parsed = Number(firstValue);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
