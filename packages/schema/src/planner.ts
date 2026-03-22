import {
  type SearchIndexDefinition,
  type SyncoreSchemaDefinition,
  type SyncoreSchema
} from "./definition.js";
import {
  describeValidator,
  type ValidatorDescription
} from "./validators.js";

export interface TableSnapshot {
  name: string;
  displayName?: string;
  componentPath?: string;
  componentName?: string;
  validator: ValidatorDescription;
  indexes: Array<{
    name: string;
    fields: string[];
  }>;
  searchIndexes: Array<{
    name: string;
    searchField: string;
    filterFields: string[];
  }>;
}

export interface SchemaSnapshot {
  formatVersion: 2;
  plannerVersion: 1;
  runtimeVersion?: string;
  tables: TableSnapshot[];
  hash: string;
}

export interface SchemaMigrationPlan {
  formatVersion: 2;
  plannerVersion: 1;
  previousHash: string | null;
  nextHash: string;
  fromSchemaHash: string | null;
  toSchemaHash: string;
  statements: string[];
  warnings: string[];
  destructiveChanges: string[];
}

export function createSchemaSnapshot<TTables extends SyncoreSchemaDefinition>(
  schema: SyncoreSchema<TTables>
): SchemaSnapshot {
  const tables = schema
    .tableNames()
    .sort((left, right) => left.localeCompare(right))
    .map((tableName) => {
      const table = schema.getTable(tableName);
      return {
        name: tableName,
        ...(table.options.tableName ? { displayName: table.options.tableName } : {}),
        ...(table.options.componentPath
          ? { componentPath: table.options.componentPath }
          : {}),
        ...(table.options.componentName
          ? { componentName: table.options.componentName }
          : {}),
        validator: describeValidator(table.validator),
        indexes: table.indexes
          .map((index) => ({
            name: index.name,
            fields: [...index.fields]
          }))
          .sort((left, right) => left.name.localeCompare(right.name)),
        searchIndexes: table.searchIndexes
          .map((index) => ({
            name: index.name,
            searchField: index.searchField,
            filterFields: [...index.filterFields]
          }))
          .sort((left, right) => left.name.localeCompare(right.name))
      };
    });

  const base = {
    formatVersion: 2 as const,
    plannerVersion: 1 as const,
    tables
  };

  return {
    ...base,
    hash: createSchemaHash(base)
  };
}

export function diffSchemaSnapshots(
  previousSnapshot: SchemaSnapshot | null | undefined,
  nextSnapshot: SchemaSnapshot
): SchemaMigrationPlan {
  const statements: string[] = [];
  const warnings: string[] = [];
  const destructiveChanges: string[] = [];

  const previousTables = new Map(
    (previousSnapshot?.tables ?? []).map((table) => [table.name, table])
  );
  const nextTables = new Map(nextSnapshot.tables.map((table) => [table.name, table]));

  for (const table of nextSnapshot.tables) {
    const previousTable = previousTables.get(table.name);
    if (!previousTable) {
      statements.push(renderCreateTableStatement(table.name));
      for (const index of table.indexes) {
        statements.push(renderCreateIndexStatement(table.name, index.name, index.fields));
      }
      for (const searchIndex of table.searchIndexes) {
        statements.push(renderCreateSearchIndexStatement(table.name, searchIndex));
      }
      continue;
    }

    if (stableStringify(previousTable.validator) !== stableStringify(table.validator)) {
      warnings.push(
        `Validator changed for table "${table.name}". Existing rows are not rewritten automatically.`
      );
    }

    const previousIndexes = new Map(
      previousTable.indexes.map((index) => [index.name, index])
    );
    const nextIndexes = new Map(table.indexes.map((index) => [index.name, index]));

    for (const index of table.indexes) {
      const previousIndex = previousIndexes.get(index.name);
      if (!previousIndex) {
        statements.push(renderCreateIndexStatement(table.name, index.name, index.fields));
        continue;
      }
      if (stableStringify(previousIndex.fields) !== stableStringify(index.fields)) {
        destructiveChanges.push(
          `Index "${table.name}.${index.name}" changed fields and requires a manual migration.`
        );
      }
    }

    for (const previousIndex of previousTable.indexes) {
      if (!nextIndexes.has(previousIndex.name)) {
        destructiveChanges.push(
          `Index "${table.name}.${previousIndex.name}" was removed and requires a manual migration.`
        );
      }
    }

    const previousSearchIndexes = new Map(
      previousTable.searchIndexes.map((index) => [index.name, index])
    );
    const nextSearchIndexes = new Map(
      table.searchIndexes.map((index) => [index.name, index])
    );

    for (const searchIndex of table.searchIndexes) {
      const previousSearchIndex = previousSearchIndexes.get(searchIndex.name);
      if (!previousSearchIndex) {
        statements.push(renderCreateSearchIndexStatement(table.name, searchIndex));
        continue;
      }
      if (stableStringify(previousSearchIndex) !== stableStringify(searchIndex)) {
        destructiveChanges.push(
          `Search index "${table.name}.${searchIndex.name}" changed and requires a manual migration.`
        );
      }
    }

    for (const previousSearchIndex of previousTable.searchIndexes) {
      if (!nextSearchIndexes.has(previousSearchIndex.name)) {
        destructiveChanges.push(
          `Search index "${table.name}.${previousSearchIndex.name}" was removed and requires a manual migration.`
        );
      }
    }
  }

  for (const previousTable of previousSnapshot?.tables ?? []) {
    if (!nextTables.has(previousTable.name)) {
      destructiveChanges.push(
        `Table "${previousTable.name}" was removed and requires a manual migration.`
      );
    }
  }

  return {
    formatVersion: 2,
    plannerVersion: 1,
    previousHash: previousSnapshot?.hash ?? null,
    nextHash: nextSnapshot.hash,
    fromSchemaHash: previousSnapshot?.hash ?? null,
    toSchemaHash: nextSnapshot.hash,
    statements,
    warnings,
    destructiveChanges
  };
}

export function renderMigrationSql(
  plan: SchemaMigrationPlan,
  options?: { title?: string }
): string {
  const lines: string[] = [];

  lines.push(`-- ${options?.title ?? "Syncore migration"}`);
  lines.push(`-- format-version: ${plan.formatVersion}`);
  lines.push(`-- planner-version: ${plan.plannerVersion}`);
  lines.push(`-- previous: ${plan.previousHash ?? "none"}`);
  lines.push(`-- next: ${plan.nextHash}`);

  for (const warning of plan.warnings) {
    lines.push(`-- warning: ${warning}`);
  }

  if (plan.destructiveChanges.length > 0) {
    for (const destructiveChange of plan.destructiveChanges) {
      lines.push(`-- destructive: ${destructiveChange}`);
    }
  }

  if (plan.statements.length > 0) {
    lines.push("");
    for (const statement of plan.statements) {
      lines.push(statement);
    }
  } else {
    lines.push("");
    lines.push("-- no-op");
  }

  return `${lines.join("\n")}\n`;
}

export function parseSchemaSnapshot(source: string): SchemaSnapshot {
  const parsed = JSON.parse(source) as
    | SchemaSnapshot
    | {
        version: 1;
        tables: TableSnapshot[];
        hash: string;
      };
  if ("formatVersion" in parsed) {
    if (
      parsed.formatVersion !== 2 ||
      parsed.plannerVersion !== 1 ||
      !Array.isArray(parsed.tables) ||
      typeof parsed.hash !== "string"
    ) {
      throw new Error("Invalid schema snapshot file.");
    }
    return parsed;
  }
  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.tables) ||
    typeof parsed.hash !== "string"
  ) {
    throw new Error("Invalid schema snapshot file.");
  }
  return {
    formatVersion: 2,
    plannerVersion: 1,
    tables: parsed.tables,
    hash: parsed.hash
  };
}

export function renderCreateTableStatement(tableName: string): string {
  return `
CREATE TABLE IF NOT EXISTS ${quoteIdentifier(tableName)} (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL,
  _json TEXT NOT NULL
);`.trim();
}

export function renderCreateIndexStatement(
  tableName: string,
  indexName: string,
  fields: string[]
): string {
  const expressions = fields
    .map((field) => `json_extract(_json, '$.${field}')`)
    .join(", ");
  return `CREATE INDEX IF NOT EXISTS ${quoteIdentifier(
    `idx_${tableName}_${indexName}`
  )} ON ${quoteIdentifier(tableName)} (${expressions});`;
}

export function renderCreateSearchIndexStatement(
  tableName: string,
  searchIndex: SearchIndexDefinition | TableSnapshot["searchIndexes"][number]
): string {
  return `CREATE VIRTUAL TABLE IF NOT EXISTS ${quoteIdentifier(
    searchIndexTableName(tableName, searchIndex.name)
  )} USING fts5(_id UNINDEXED, search_value);`;
}

export function searchIndexTableName(tableName: string, indexName: string): string {
  return `fts_${tableName}_${indexName}`;
}

function createSchemaHash(
  value: Omit<SchemaSnapshot, "hash" | "runtimeVersion"> & {
    runtimeVersion?: string;
  }
): string {
  return stableStringify(value);
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)])
    );
  }
  return value;
}
