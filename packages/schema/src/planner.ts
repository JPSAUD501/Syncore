import {
  type SearchIndexDefinition,
  type SyncoreSchemaDefinition,
  type SyncoreSchema
} from "./definition.js";
import { describeValidator, type ValidatorDescription } from "./validators.js";
import { quoteIdentifier, stableStringify } from "@syncore/internal";

export interface TableFieldSnapshot {
  name: string;
  validator: ValidatorDescription;
  storage: ValidatorDescription;
  optional: boolean;
}

export interface TableSnapshot {
  name: string;
  displayName?: string;
  componentPath?: string;
  componentName?: string;
  validator: ValidatorDescription;
  fieldPaths: string[];
  fields: TableFieldSnapshot[];
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
  formatVersion: 4;
  plannerVersion: 3;
  runtimeVersion?: string;
  tables: TableSnapshot[];
  hash: string;
}

export type SchemaChangeSeverity = "statement" | "warning" | "destructive";

export type SchemaChange =
  | {
      kind: "table-added";
      severity: "statement";
      table: string;
      statement: string;
    }
  | {
      kind: "table-removed";
      severity: "destructive";
      table: string;
      message: string;
    }
  | {
      kind: "field-added";
      severity: "warning";
      table: string;
      field: string;
      validator: ValidatorDescription;
      storage: ValidatorDescription;
      optional: boolean;
      message: string;
    }
  | {
      kind: "field-removed";
      severity: "destructive";
      table: string;
      field: string;
      message: string;
    }
  | {
      kind: "field-validator-changed";
      severity: "warning";
      table: string;
      field?: string;
      previousValidator: ValidatorDescription;
      nextValidator: ValidatorDescription;
      message: string;
    }
  | {
      kind: "index-added";
      severity: "statement";
      table: string;
      index: string;
      fields: string[];
      statement: string;
    }
  | {
      kind: "index-removed";
      severity: "destructive";
      table: string;
      index: string;
      fields: string[];
      message: string;
    }
  | {
      kind: "index-changed";
      severity: "destructive";
      table: string;
      index: string;
      previousFields: string[];
      nextFields: string[];
      message: string;
    }
  | {
      kind: "search-index-added";
      severity: "statement";
      table: string;
      index: string;
      searchField: string;
      filterFields: string[];
      statement: string;
    }
  | {
      kind: "search-index-removed";
      severity: "destructive";
      table: string;
      index: string;
      searchField: string;
      filterFields: string[];
      message: string;
    }
  | {
      kind: "search-index-changed";
      severity: "destructive";
      table: string;
      index: string;
      previousSearchField: string;
      nextSearchField: string;
      previousFilterFields: string[];
      nextFilterFields: string[];
      message: string;
    };

export interface SchemaMigrationPlan {
  formatVersion: 4;
  plannerVersion: 3;
  previousHash: string | null;
  nextHash: string;
  fromSchemaHash: string | null;
  toSchemaHash: string;
  changes: SchemaChange[];
  statements: string[];
}

export function createSchemaSnapshot<TTables extends SyncoreSchemaDefinition>(
  schema: SyncoreSchema<TTables>
): SchemaSnapshot {
  const tables = schema
    .tableNames()
    .sort((left, right) => left.localeCompare(right))
    .map((tableName) => {
      const table = schema.getTable(tableName);
      const validator = describeValidator(table.validator);
      return {
        name: tableName,
        ...(table.options.tableName
          ? { displayName: table.options.tableName }
          : {}),
        ...(table.options.componentPath
          ? { componentPath: table.options.componentPath }
          : {}),
        ...(table.options.componentName
          ? { componentName: table.options.componentName }
          : {}),
        validator,
        fieldPaths: extractFieldPaths(validator),
        fields: extractTopLevelFields(validator),
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
    formatVersion: 4 as const,
    plannerVersion: 3 as const,
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
  const changes: SchemaChange[] = [];

  const previousTables = new Map(
    (previousSnapshot?.tables ?? []).map((table) => [table.name, table])
  );
  const nextTables = new Map(
    nextSnapshot.tables.map((table) => [table.name, table])
  );

  for (const table of nextSnapshot.tables) {
    const previousTable = previousTables.get(table.name);
    if (!previousTable) {
      changes.push({
        kind: "table-added",
        severity: "statement",
        table: table.name,
        statement: renderCreateTableStatement(table.name)
      });
      for (const index of table.indexes) {
        changes.push({
          kind: "index-added",
          severity: "statement",
          table: table.name,
          index: index.name,
          fields: [...index.fields],
          statement: renderCreateIndexStatement(
            table.name,
            index.name,
            index.fields
          )
        });
      }
      for (const searchIndex of table.searchIndexes) {
        changes.push({
          kind: "search-index-added",
          severity: "statement",
          table: table.name,
          index: searchIndex.name,
          searchField: searchIndex.searchField,
          filterFields: [...searchIndex.filterFields],
          statement: renderCreateSearchIndexStatement(table.name, searchIndex)
        });
      }
      continue;
    }

    collectFieldChanges(previousTable, table, changes);

    const previousIndexes = new Map(
      previousTable.indexes.map((index) => [index.name, index])
    );
    const nextIndexes = new Map(
      table.indexes.map((index) => [index.name, index])
    );

    for (const index of table.indexes) {
      const previousIndex = previousIndexes.get(index.name);
      if (!previousIndex) {
        changes.push({
          kind: "index-added",
          severity: "statement",
          table: table.name,
          index: index.name,
          fields: [...index.fields],
          statement: renderCreateIndexStatement(
            table.name,
            index.name,
            index.fields
          )
        });
        continue;
      }
      if (
        stableStringify(previousIndex.fields) !== stableStringify(index.fields)
      ) {
        changes.push({
          kind: "index-changed",
          severity: "destructive",
          table: table.name,
          index: index.name,
          previousFields: [...previousIndex.fields],
          nextFields: [...index.fields],
          message: `Index "${table.name}.${index.name}" changed fields and requires a manual migration.`
        });
      }
    }

    for (const previousIndex of previousTable.indexes) {
      if (!nextIndexes.has(previousIndex.name)) {
        changes.push({
          kind: "index-removed",
          severity: "destructive",
          table: table.name,
          index: previousIndex.name,
          fields: [...previousIndex.fields],
          message: `Index "${table.name}.${previousIndex.name}" was removed and requires a manual migration.`
        });
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
        changes.push({
          kind: "search-index-added",
          severity: "statement",
          table: table.name,
          index: searchIndex.name,
          searchField: searchIndex.searchField,
          filterFields: [...searchIndex.filterFields],
          statement: renderCreateSearchIndexStatement(table.name, searchIndex)
        });
        continue;
      }
      if (
        stableStringify(previousSearchIndex) !== stableStringify(searchIndex)
      ) {
        changes.push({
          kind: "search-index-changed",
          severity: "destructive",
          table: table.name,
          index: searchIndex.name,
          previousSearchField: previousSearchIndex.searchField,
          nextSearchField: searchIndex.searchField,
          previousFilterFields: [...previousSearchIndex.filterFields],
          nextFilterFields: [...searchIndex.filterFields],
          message: `Search index "${table.name}.${searchIndex.name}" changed and requires a manual migration.`
        });
      }
    }

    for (const previousSearchIndex of previousTable.searchIndexes) {
      if (!nextSearchIndexes.has(previousSearchIndex.name)) {
        changes.push({
          kind: "search-index-removed",
          severity: "destructive",
          table: table.name,
          index: previousSearchIndex.name,
          searchField: previousSearchIndex.searchField,
          filterFields: [...previousSearchIndex.filterFields],
          message: `Search index "${table.name}.${previousSearchIndex.name}" was removed and requires a manual migration.`
        });
      }
    }
  }

  for (const previousTable of previousSnapshot?.tables ?? []) {
    if (!nextTables.has(previousTable.name)) {
      changes.push({
        kind: "table-removed",
        severity: "destructive",
        table: previousTable.name,
        message: `Table "${previousTable.name}" was removed and requires a manual migration.`
      });
    }
  }

  const statements = changes.flatMap((change) =>
    "statement" in change ? [change.statement] : []
  );

  return {
    formatVersion: 4,
    plannerVersion: 3,
    previousHash: previousSnapshot?.hash ?? null,
    nextHash: nextSnapshot.hash,
    fromSchemaHash: previousSnapshot?.hash ?? null,
    toSchemaHash: nextSnapshot.hash,
    changes,
    statements
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

  for (const warning of getSchemaChangesBySeverity(plan, "warning")) {
    lines.push(`-- warning: ${formatSchemaChange(warning)}`);
  }

  const destructiveChanges = getSchemaChangesBySeverity(plan, "destructive");
  if (destructiveChanges.length > 0) {
    lines.push("-- destructive-review-required: true");
    for (const destructiveChange of destructiveChanges) {
      lines.push(`-- destructive: ${formatSchemaChange(destructiveChange)}`);
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
  const parsed = JSON.parse(source) as SchemaSnapshot;
  if (
    parsed.formatVersion !== 4 ||
    parsed.plannerVersion !== 3 ||
    !Array.isArray(parsed.tables) ||
    typeof parsed.hash !== "string" ||
    !parsed.hash.startsWith("sha256:")
  ) {
    throw new Error("Invalid schema snapshot file.");
  }
  return parsed;
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

export function searchIndexTableName(
  tableName: string,
  indexName: string
): string {
  return `fts_${tableName}_${indexName}`;
}

function createSchemaHash(
  value: Omit<SchemaSnapshot, "hash" | "runtimeVersion"> & {
    runtimeVersion?: string;
  }
): string {
  const digest = sha256Hex(stableStringify(value)).slice(0, 16);
  return `sha256:${digest}`;
}

export function getSchemaChangesBySeverity<TSeverity extends SchemaChangeSeverity>(
  plan: Pick<SchemaMigrationPlan, "changes">,
  severity: TSeverity
): Array<Extract<SchemaChange, { severity: TSeverity }>> {
  return plan.changes.filter(
    (change): change is Extract<SchemaChange, { severity: TSeverity }> =>
      change.severity === severity
  );
}

export function formatSchemaChange(change: SchemaChange): string {
  if ("message" in change) {
    return change.message;
  }
  switch (change.kind) {
    case "table-added":
      return `Table "${change.table}" will be created.`;
    case "index-added":
      return `Index "${change.table}.${change.index}" will be created.`;
    case "search-index-added":
      return `Search index "${change.table}.${change.index}" will be created.`;
  }
}

function collectFieldChanges(
  previousTable: TableSnapshot,
  nextTable: TableSnapshot,
  changes: SchemaChange[]
): void {
  const previousFields = new Map(
    previousTable.fields.map((field) => [field.name, field])
  );
  const nextFields = new Map(nextTable.fields.map((field) => [field.name, field]));
  let hasFieldChange = false;

  for (const field of nextTable.fields) {
    const previousField = previousFields.get(field.name);
    if (!previousField) {
      hasFieldChange = true;
      changes.push({
        kind: "field-added",
        severity: "warning",
        table: nextTable.name,
        field: field.name,
        validator: field.validator,
        storage: field.storage,
        optional: field.optional,
        message: `Field "${nextTable.name}.${field.name}" was added. Existing rows are not rewritten automatically.`
      });
      continue;
    }
    if (
      stableStringify(previousField.validator) !==
        stableStringify(field.validator) ||
      stableStringify(previousField.storage) !== stableStringify(field.storage) ||
      previousField.optional !== field.optional
    ) {
      hasFieldChange = true;
      changes.push({
        kind: "field-validator-changed",
        severity: "warning",
        table: nextTable.name,
        field: field.name,
        previousValidator: previousField.validator,
        nextValidator: field.validator,
        message: `Field "${nextTable.name}.${field.name}" validator changed. Existing rows are not rewritten automatically.`
      });
    }
  }

  for (const previousField of previousTable.fields) {
    if (!nextFields.has(previousField.name)) {
      hasFieldChange = true;
      changes.push({
        kind: "field-removed",
        severity: "destructive",
        table: previousTable.name,
        field: previousField.name,
        message: `Field "${previousTable.name}.${previousField.name}" was removed and requires a manual migration.`
      });
    }
  }

  if (
    !hasFieldChange &&
    stableStringify(previousTable.validator) !== stableStringify(nextTable.validator)
  ) {
    changes.push({
      kind: "field-validator-changed",
      severity: "warning",
      table: nextTable.name,
      previousValidator: previousTable.validator,
      nextValidator: nextTable.validator,
      message: `Validator changed for table "${nextTable.name}". Existing rows are not rewritten automatically.`
    });
  }
}

function extractFieldPaths(
  description: ValidatorDescription,
  prefix = ""
): string[] {
  switch (description.kind) {
    case "object":
      return Object.entries(description.shape).flatMap(([key, entry]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        const normalizedEntry = normalizeObjectFieldEntry(entry);
        const nested = extractFieldPaths(normalizedEntry.validator, path);
        return nested.length > 0 ? [path, ...nested] : [path];
      });
    case "optional":
      return extractFieldPaths(description.inner, prefix);
    case "codec":
      return extractFieldPaths(description.value, prefix);
    case "union":
      return [
        ...new Set(
          description.members.flatMap((member) =>
            extractFieldPaths(member, prefix)
          )
        )
      ];
    default:
      return [];
  }
}

function extractTopLevelFields(
  description: ValidatorDescription
): TableFieldSnapshot[] {
  if (description.kind !== "object") {
    return [];
  }
  return Object.entries(description.shape)
    .map(([name, entry]) => {
      const normalizedEntry = normalizeObjectFieldEntry(entry);
      return {
        name,
        validator: normalizedEntry.validator,
        storage:
          normalizedEntry.validator.kind === "codec"
            ? normalizedEntry.validator.storage
            : normalizedEntry.validator,
        optional: normalizedEntry.optional
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function normalizeObjectFieldEntry(
  entry:
    | ValidatorDescription
    | {
        validator: ValidatorDescription;
        optional?: boolean;
      }
): {
  validator: ValidatorDescription;
  optional: boolean;
} {
  if ("validator" in entry) {
    return {
      validator: entry.validator,
      optional: entry.optional ?? false
    };
  }
  if (entry.kind === "optional") {
    return {
      validator: entry.inner,
      optional: true
    };
  }
  return {
    validator: entry,
    optional: false
  };
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight(words[index - 15]!, 7) ^
        rotateRight(words[index - 15]!, 18) ^
        (words[index - 15]! >>> 3);
      const s1 =
        rotateRight(words[index - 2]!, 17) ^
        rotateRight(words[index - 2]!, 19) ^
        (words[index - 2]! >>> 10);
      words[index] =
        (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let index = 0; index < 64; index += 1) {
      const s1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index]! + words[index]!) >>> 0;
      const s0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => value.toString(16).padStart(8, "0"))
    .join("");
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
  0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
  0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
  0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
  0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
  0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
