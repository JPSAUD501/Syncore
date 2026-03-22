import {
  describeValidator,
  createSchemaSnapshot,
  diffSchemaSnapshots,
  parseSchemaSnapshot,
  renderCreateSearchIndexStatement,
  renderMigrationSql,
  type Validator
} from "@syncore/schema";
import type {
  TableDefinition
} from "@syncore/schema";
import type {
  DevtoolsLiveQuerySnapshot,
  JsonObject,
  SyncoreDataModel,
  SyncoreSqlDriver
} from "../../runtime.js";
import {
  getTableDefinition,
  quoteIdentifier,
  resolveSearchIndexTableName,
  searchIndexKey,
  stableStringify,
  toSearchValue,
  type DatabaseRow
} from "./shared.js";
import { type DevtoolsEngine } from "./devtoolsEngine.js";

type RecordDocument = Record<string, unknown>;
type StructuredValidator = Validator<RecordDocument, RecordDocument, string>;
type StructuredTableDefinition = TableDefinition<StructuredValidator>;

type SchemaEngineDeps<TSchema extends SyncoreDataModel> = {
  schema: TSchema;
  driver: SyncoreSqlDriver;
  runtimeId: string;
  devtools: DevtoolsEngine;
};

export class SchemaEngine<
  TSchema extends SyncoreDataModel
> {
  private readonly disabledSearchIndexes = new Set<string>();

  constructor(private readonly deps: SchemaEngineDeps<TSchema>) {}

  async prepare(): Promise<void> {
    await this.deps.driver.exec(`
      CREATE TABLE IF NOT EXISTS "_syncore_migrations" (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL,
        sql TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "_syncore_schema_state" (
        id TEXT PRIMARY KEY,
        schema_hash TEXT NOT NULL,
        schema_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    try {
      await this.deps.driver.exec(
        `ALTER TABLE "_syncore_schema_state" ADD COLUMN schema_json TEXT NOT NULL DEFAULT '{}'`
      );
    } catch {
      // Column already exists.
    }
  }

  async applySchema(): Promise<void> {
    const nextSnapshot = createSchemaSnapshot(this.deps.schema);
    const stateRow = await this.deps.driver.get<{
      schema_hash: string;
      schema_json: string;
    }>(
      `SELECT schema_hash, schema_json FROM "_syncore_schema_state" WHERE id = 'current'`
    );
    let previousSnapshot = null;
    if (stateRow?.schema_json && stateRow.schema_json !== "{}") {
      try {
        previousSnapshot = parseSchemaSnapshot(stateRow.schema_json);
      } catch {
        previousSnapshot = null;
      }
    }
    const plan = diffSchemaSnapshots(previousSnapshot, nextSnapshot);

    if (plan.destructiveChanges.length > 0) {
      throw new Error(
        `Syncore detected destructive schema changes that require a manual migration:\n${plan.destructiveChanges.join(
          "\n"
        )}`
      );
    }

    for (const warning of plan.warnings) {
      this.deps.devtools.emit({
        type: "log",
        runtimeId: this.deps.runtimeId,
        level: "warn",
        message: warning,
        timestamp: Date.now()
      });
    }

    for (const statement of plan.statements) {
      const searchKey = this.findSearchIndexKeyForStatement(statement);
      try {
        await this.deps.driver.exec(statement);
      } catch (error) {
        if (searchKey) {
          this.disabledSearchIndexes.add(searchKey);
          this.deps.devtools.emit({
            type: "log",
            runtimeId: this.deps.runtimeId,
            level: "warn",
            message: `FTS5 unavailable for ${searchKey}; falling back to LIKE search.`,
            timestamp: Date.now()
          });
          continue;
        }
        throw error;
      }
    }

    if (plan.statements.length > 0 || plan.warnings.length > 0) {
      const migrationSql = renderMigrationSql(plan, {
        title: "Syncore automatic schema reconciliation"
      });
      await this.deps.driver.run(
        `INSERT OR REPLACE INTO "_syncore_migrations" (id, applied_at, sql) VALUES (?, ?, ?)`,
        [nextSnapshot.hash, Date.now(), migrationSql]
      );
    }

    await this.deps.driver.run(
      `INSERT INTO "_syncore_schema_state" (id, schema_hash, schema_json, updated_at)
       VALUES ('current', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET schema_hash = excluded.schema_hash, schema_json = excluded.schema_json, updated_at = excluded.updated_at`,
      [nextSnapshot.hash, stableStringify(nextSnapshot), Date.now()]
    );

    for (const tableName of this.deps.schema.tableNames()) {
      const table = this.getTableDefinition(tableName);
      for (const searchIndex of table.searchIndexes) {
        const key = searchIndexKey(tableName, searchIndex.name);
        try {
          await this.deps.driver.exec(
            renderCreateSearchIndexStatement(tableName, searchIndex)
          );
          this.disabledSearchIndexes.delete(key);
        } catch {
          const alreadyDisabled = this.disabledSearchIndexes.has(key);
          this.disabledSearchIndexes.add(key);
          if (!alreadyDisabled) {
            this.deps.devtools.emit({
              type: "log",
              runtimeId: this.deps.runtimeId,
              level: "warn",
              message: `FTS5 unavailable for ${key}; falling back to LIKE search.`,
              timestamp: Date.now()
            });
          }
        }
      }
    }
  }

  getTableDefinition(
    tableName: string
  ): StructuredTableDefinition {
    return getTableDefinition(this.deps.schema, tableName);
  }

  isSearchIndexDisabled(tableName: string, indexName: string): boolean {
    return this.disabledSearchIndexes.has(searchIndexKey(tableName, indexName));
  }

  validateDocument(tableName: string, value: JsonObject): JsonObject {
    const table = this.getTableDefinition(tableName);
    return table.parseAndSerialize(value) as JsonObject;
  }

  deserializeDocument<TDocument>(tableName: string, row: DatabaseRow): TDocument {
    const table = this.getTableDefinition(tableName);
    const payload = this.parseStoredDocument(row._json);
    const document: RecordDocument & {
      _id: string;
      _creationTime: number;
    } = {
      ...table.deserialize(payload),
      _id: row._id,
      _creationTime: row._creationTime
    };
    return document as TDocument;
  }

  async syncSearchIndexes(
    tableName: string,
    row: DatabaseRow
  ): Promise<void> {
    const table = this.getTableDefinition(tableName);
    if (table.searchIndexes.length === 0) {
      return;
    }
    const payload = this.parseStoredDocument(row._json);
    for (const searchIndex of table.searchIndexes) {
      if (this.isSearchIndexDisabled(tableName, searchIndex.name)) {
        continue;
      }
      const searchTable = resolveSearchIndexTableName(tableName, searchIndex.name);
      await this.deps.driver.run(
        `DELETE FROM ${quoteIdentifier(searchTable)} WHERE _id = ?`,
        [row._id]
      );
      await this.deps.driver.run(
        `INSERT INTO ${quoteIdentifier(searchTable)} (_id, search_value) VALUES (?, ?)`,
        [row._id, toSearchValue(payload[searchIndex.searchField])]
      );
    }
  }

  private parseStoredDocument(json: string): RecordDocument {
    const value = JSON.parse(json) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Stored Syncore document payload must be a JSON object.");
    }
    return value as RecordDocument;
  }

  async removeSearchIndexes(tableName: string, id: string): Promise<void> {
    const table = this.getTableDefinition(tableName);
    for (const searchIndex of table.searchIndexes) {
      if (this.isSearchIndexDisabled(tableName, searchIndex.name)) {
        continue;
      }
      await this.deps.driver.run(
        `DELETE FROM ${quoteIdentifier(
          resolveSearchIndexTableName(tableName, searchIndex.name)
        )} WHERE _id = ?`,
        [id]
      );
    }
  }

  async getSchemaTablesForDevtools(): Promise<
    DevtoolsLiveQuerySnapshot["schemaTables"]
  > {
    const tables = [] as DevtoolsLiveQuerySnapshot["schemaTables"];

    for (const name of this.deps.schema.tableNames()) {
      const table = this.getTableDefinition(name);
      const validatorDesc = describeValidator(table.validator);
      const fields =
        validatorDesc.kind === "object"
          ? Object.entries(validatorDesc.shape).map(
              ([fieldName, fieldDesc]) => {
                const field = fieldDesc as {
                  validator: { kind: string };
                  optional: boolean;
                };
                return {
                  name: fieldName,
                  type: field.validator.kind,
                  optional: field.optional
                };
              }
            )
          : [];

      fields.unshift(
        { name: "_id", type: "string", optional: false },
        { name: "_creationTime", type: "number", optional: false }
      );

      let documentCount = 0;
      try {
        const countRow = await this.deps.driver.get<{ count: number }>(
          `SELECT COUNT(*) as count FROM ${quoteIdentifier(name)}`
        );
        documentCount = countRow?.count ?? 0;
      } catch {
        documentCount = 0;
      }

      tables.push({
        name,
        ...(table.options.tableName ? { displayName: table.options.tableName } : {}),
        owner: table.options.componentPath ? "component" : "root",
        ...(table.options.componentPath
          ? { componentPath: table.options.componentPath }
          : {}),
        ...(table.options.componentName
          ? { componentName: table.options.componentName }
          : {}),
        fields,
        indexes: table.indexes.map((index) => ({
          name: index.name,
          fields: index.fields,
          unique: false
        })),
        documentCount
      });
    }

    return tables;
  }

  private findSearchIndexKeyForStatement(statement: string): string | null {
    for (const tableName of this.deps.schema.tableNames()) {
      const table = this.getTableDefinition(tableName);
      for (const searchIndex of table.searchIndexes) {
        if (
          statement === renderCreateSearchIndexStatement(tableName, searchIndex)
        ) {
          return searchIndexKey(tableName, searchIndex.name);
        }
      }
    }
    return null;
  }
}
