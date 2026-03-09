import { DatabaseSync } from "node:sqlite";
import {
  Parser as ImportedParser,
  type AST,
  type From,
  type Select,
  type Update,
  type Delete,
  type Insert_Replace,
  type Create,
  type Drop,
  type Alter
} from "node-sql-parser";
import type { DevtoolsLiveQueryScope } from "./runtime.js";

const sqlParserModule = (
  ImportedParser as unknown as { default?: typeof ImportedParser }
).default
  ? (ImportedParser as unknown as { default: typeof ImportedParser }).default
  : ImportedParser;

export type DevtoolsSqlMode = "read" | "write" | "ddl";

export interface DevtoolsSqlAnalysis {
  mode: DevtoolsSqlMode;
  readTables: string[];
  writeTables: string[];
  schemaChanged: boolean;
  observedScopes: DevtoolsLiveQueryScope[];
}

const parser = new sqlParserModule();

export function analyzeSqlStatement(query: string): DevtoolsSqlAnalysis {
  const ast = parser.astify(query, { database: "sqlite" });
  if (Array.isArray(ast)) {
    throw new Error("Only a single SQL statement is supported.");
  }

  switch (ast.type) {
    case "select":
      return buildReadAnalysis(ast);
    case "update":
      return buildWriteAnalysis(extractUpdateTables(ast), false);
    case "delete":
      return buildWriteAnalysis(extractDeleteTables(ast), false);
    case "insert":
    case "replace":
      return buildWriteAnalysis(extractInsertTables(ast), false);
    case "create":
    case "drop":
    case "alter":
      return buildWriteAnalysis(extractDdlTables(ast), true);
    default:
      throw new Error(`Unsupported SQL statement type: ${String(ast.type)}`);
  }
}

export function ensureSqlMode(
  analysis: DevtoolsSqlAnalysis,
  expected: DevtoolsSqlMode | "watch"
): void {
  if (expected === "watch") {
    if (analysis.mode !== "read") {
      throw new Error("Live mode supports read-only SQL only.");
    }
    return;
  }

  if (analysis.mode !== expected) {
    if (expected === "read") {
      throw new Error("Use SQL Write for mutating statements.");
    }
    throw new Error("Use SQL Read or SQL Live for read-only statements.");
  }
}

export function runReadonlyQuery(
  databasePath: string,
  query: string
): { columns: string[]; rows: unknown[][]; observedTables: string[] } {
  const analysis = analyzeSqlStatement(query);
  ensureSqlMode(analysis, "read");

  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const statement = database.prepare(query);
    const rows = statement.all() as Array<Record<string, unknown>>;
    const columnsMeta = statement.columns();
    const columns = columnsMeta.map((column) => column.name);
    const observedTables = Array.from(
      new Set(
        columnsMeta
          .map((column) => column.table)
          .filter((table): table is string => typeof table === "string")
      )
    );

    return {
      columns,
      rows: rows.map((row) => columns.map((column) => row[column])),
      observedTables:
        observedTables.length > 0 ? observedTables : analysis.readTables
    };
  } finally {
    database.close();
  }
}

function buildReadAnalysis(select: Select): DevtoolsSqlAnalysis {
  const readTables = Array.from(new Set(extractTablesFromSelect(select)));
  return {
    mode: "read",
    readTables,
    writeTables: [],
    schemaChanged: false,
    observedScopes:
      readTables.length > 0
        ? readTables.map((table) => `table:${table}` as const)
        : ["all"]
  };
}

function buildWriteAnalysis(
  tables: string[],
  schemaChanged: boolean
): DevtoolsSqlAnalysis {
  const uniqueTables = Array.from(new Set(tables));
  const observedScopes: DevtoolsLiveQueryScope[] = schemaChanged
    ? [
        "schema.tables",
        ...uniqueTables.map((table) => `table:${table}` as const)
      ]
    : uniqueTables.length > 0
      ? uniqueTables.map((table) => `table:${table}` as const)
      : ["all"];

  return {
    mode: schemaChanged ? "ddl" : "write",
    readTables: [],
    writeTables: uniqueTables,
    schemaChanged,
    observedScopes
  };
}

function extractTablesFromSelect(select: Select): string[] {
  const fromEntries = Array.isArray(select.from) ? select.from : [];
  return fromEntries
    .flatMap((entry: From) => {
      if ("table" in entry && typeof entry.table === "string") {
        return [entry.table];
      }
      if ("expr" in entry && entry.expr?.ast) {
        const ast = entry.expr.ast as AST;
        return ast.type === "select" ? extractTablesFromSelect(ast) : [];
      }
      return [];
    })
    .filter((table: string) => table !== "dual");
}

function extractUpdateTables(update: Update): string[] {
  return (update.table ?? [])
    .map((entry) => ("table" in entry ? entry.table : null))
    .filter((table): table is string => typeof table === "string");
}

function extractDeleteTables(statement: Delete): string[] {
  return statement.from
    .map((entry) => ("table" in entry ? entry.table : null))
    .filter((table): table is string => typeof table === "string");
}

function extractInsertTables(statement: Insert_Replace): string[] {
  if (Array.isArray(statement.table)) {
    return statement.table
      .map((entry) => entry?.table)
      .filter((table): table is string => typeof table === "string");
  }
  if (statement.table && typeof statement.table === "object") {
    const table = (statement.table as { table?: string }).table;
    return typeof table === "string" ? [table] : [];
  }
  return [];
}

function extractDdlTables(statement: Create | Drop | Alter): string[] {
  if ("table" in statement && Array.isArray(statement.table)) {
    return statement.table
      .map((entry) => ("table" in entry ? entry.table : null))
      .filter((table): table is string => typeof table === "string");
  }
  if (
    "table" in statement &&
    statement.table &&
    typeof statement.table === "object" &&
    !Array.isArray(statement.table) &&
    "table" in statement.table &&
    typeof statement.table.table === "string"
  ) {
    return [statement.table.table];
  }
  return [];
}
