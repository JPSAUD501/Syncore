import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const defaultDatabaseDirectory = path.join(
  os.tmpdir(),
  "syncore-expo-contract-fs",
  "databases"
);

type MockSqliteResult = {
  changes: number;
  lastInsertRowId?: number | string;
};

class MockSQLiteDatabase {
  constructor(private readonly database: DatabaseSync) {}

  async execAsync(sql: string): Promise<void> {
    this.database.exec(sql);
  }

  async runAsync(sql: string, params: unknown[]): Promise<MockSqliteResult> {
    const statement = this.database.prepare(sql);
    const result = statement.run(...(params as SQLInputValue[]));
    return {
      changes: Number(result.changes),
      ...(result.lastInsertRowid === undefined
        ? {}
        : { lastInsertRowId: normalizeLastInsertRowId(result.lastInsertRowid) })
    };
  }

  async getFirstAsync<T>(sql: string, params: unknown[]): Promise<T | null> {
    const statement = this.database.prepare(sql);
    return (statement.get(...(params as SQLInputValue[])) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, params: unknown[]): Promise<T[]> {
    const statement = this.database.prepare(sql);
    return statement.all(...(params as SQLInputValue[])) as T[];
  }

  async closeAsync(): Promise<void> {
    this.database.close();
  }
}

export function openDatabaseSync(
  name: string,
  _options?: unknown,
  directory?: string
): MockSQLiteDatabase {
  const resolvedDirectory = directory ?? defaultDatabaseDirectory;
  mkdirSync(resolvedDirectory, { recursive: true });
  const databasePath = path.join(resolvedDirectory, name);
  return new MockSQLiteDatabase(new DatabaseSync(databasePath));
}

function normalizeLastInsertRowId(value: number | bigint): number | string {
  return typeof value === "bigint" ? value.toString() : value;
}
