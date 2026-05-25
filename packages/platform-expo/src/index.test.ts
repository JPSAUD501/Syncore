import { describe, expect, it, vi } from "vitest";
import { ExpoSqliteDriver } from "./index.js";

vi.mock("expo-file-system", () => ({
  Directory: class {
    exists = true;
    create = vi.fn();
  },
  File: class {
    exists = false;
    size = 0;
    type = "";
    uri = "file://mock";
    create = vi.fn(() => {
      this.exists = true;
    });
    write = vi.fn();
    bytes = vi.fn(() => new Uint8Array());
    delete = vi.fn(() => {
      this.exists = false;
    });
  },
  Paths: {
    document: "file://document"
  }
}));

vi.mock("expo-sqlite", () => ({
  defaultDatabaseDirectory: "mock-db-directory",
  openDatabaseSync: vi.fn()
}));

describe("ExpoSqliteDriver", () => {
  it("normalizes Syncore values for expo-sqlite parameters", async () => {
    const db = createMockDatabase();
    const driver = new ExpoSqliteDriver(db as never);
    const bytes = new Uint8Array([1, 2, 3]);

    await driver.run("insert into notes values (?, ?, ?, ?)", [
      true,
      { nested: "value" },
      bytes,
      null
    ]);

    expect(db.runAsync).toHaveBeenCalledWith(
      "insert into notes values (?, ?, ?, ?)",
      [1, '{"nested":"value"}', bytes, null]
    );
  });

  it("wraps top-level and nested transactions with sqlite savepoints", async () => {
    const db = createMockDatabase();
    const driver = new ExpoSqliteDriver(db as never);

    await driver.withTransaction(async () => {
      await driver.withTransaction(async () => undefined);
    });

    expect(db.execAsync).toHaveBeenNthCalledWith(1, "BEGIN IMMEDIATE");
    expect(db.execAsync).toHaveBeenNthCalledWith(2, "SAVEPOINT nested_1");
    expect(db.execAsync).toHaveBeenNthCalledWith(3, "RELEASE SAVEPOINT nested_1");
    expect(db.execAsync).toHaveBeenNthCalledWith(4, "COMMIT");
  });

  it("rejects queries after close", async () => {
    const db = createMockDatabase();
    const driver = new ExpoSqliteDriver(db as never);

    await driver.close();

    await expect(driver.all("select 1")).rejects.toThrow(
      "The Expo SQLite driver is already closed."
    );
  });
});

function createMockDatabase() {
  return {
    execAsync: vi.fn(async () => undefined),
    runAsync: vi.fn(async () => ({ changes: 1, lastInsertRowId: 12 })),
    getFirstAsync: vi.fn(async () => null),
    getAllAsync: vi.fn(async () => []),
    closeAsync: vi.fn(async () => undefined)
  };
}
