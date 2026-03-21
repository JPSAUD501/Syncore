import type { SyncoreSqlDriver } from "../runtime.js";

export interface SystemFormatRegistry {
  schema_state_format_version: number;
  storage_format_version: number;
  scheduler_format_version: number;
  runtime_meta_version: number;
}

export const CURRENT_SYSTEM_FORMATS: SystemFormatRegistry = {
  schema_state_format_version: 1,
  storage_format_version: 1,
  scheduler_format_version: 1,
  runtime_meta_version: 1
};

const META_TABLE_NAME = "_syncore_system_meta";

export async function ensureSystemMetaTable(
  driver: SyncoreSqlDriver
): Promise<void> {
  await driver.exec(`
    CREATE TABLE IF NOT EXISTS "${META_TABLE_NAME}" (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

export async function loadSystemFormats(
  driver: SyncoreSqlDriver
): Promise<SystemFormatRegistry> {
  await ensureSystemMetaTable(driver);
  const rows = await driver.all<{ key: string; value: string }>(
    `SELECT key, value FROM "${META_TABLE_NAME}"`
  );
  const loaded = { ...CURRENT_SYSTEM_FORMATS };

  for (const row of rows) {
    if (!isSystemFormatKey(row.key)) {
      continue;
    }
    const parsed = Number.parseInt(row.value, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid Syncore system format value for "${row.key}".`);
    }
    loaded[row.key] = parsed;
  }

  return loaded;
}

export async function ensureSupportedSystemFormats(
  driver: SyncoreSqlDriver
): Promise<SystemFormatRegistry> {
  const loaded = await loadSystemFormats(driver);

  for (const key of systemFormatKeys()) {
    if (loaded[key] > CURRENT_SYSTEM_FORMATS[key]) {
      throw new Error(
        `Syncore system format "${key}" version ${loaded[key]} is newer than this runtime supports (${CURRENT_SYSTEM_FORMATS[key]}).`
      );
    }
  }

  const now = Date.now();
  for (const key of systemFormatKeys()) {
    if (loaded[key] === CURRENT_SYSTEM_FORMATS[key]) {
      await driver.run(
        `INSERT OR REPLACE INTO "${META_TABLE_NAME}" (key, value, updated_at) VALUES (?, ?, ?)`,
        [key, String(loaded[key]), now]
      );
      continue;
    }
    await driver.run(
      `INSERT OR REPLACE INTO "${META_TABLE_NAME}" (key, value, updated_at) VALUES (?, ?, ?)`,
      [key, String(CURRENT_SYSTEM_FORMATS[key]), now]
    );
    loaded[key] = CURRENT_SYSTEM_FORMATS[key];
  }

  return loaded;
}

function systemFormatKeys(): Array<keyof SystemFormatRegistry> {
  return Object.keys(CURRENT_SYSTEM_FORMATS) as Array<keyof SystemFormatRegistry>;
}

function isSystemFormatKey(value: string): value is keyof SystemFormatRegistry {
  return systemFormatKeys().includes(value as keyof SystemFormatRegistry);
}
