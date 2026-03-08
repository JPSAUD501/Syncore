import {
  ensureObjectValidator,
  type Infer,
  type ObjectValidatorShape,
  type Validator
} from "./validators.js";
import type { ObjectValidator } from "./validators.js";

export interface IndexDefinition {
  name: string;
  fields: string[];
}

export interface SearchIndexDefinition {
  name: string;
  searchField: string;
  filterFields: string[];
}

export interface TableDefinitionOptions {
  tableName?: string;
}

export interface TableDocumentSystemFields {
  _id: string;
  _creationTime: number;
}

export class TableDefinition<TValidator extends Validator<unknown>> {
  readonly indexes: IndexDefinition[] = [];
  readonly searchIndexes: SearchIndexDefinition[] = [];
  readonly options: TableDefinitionOptions;

  constructor(public readonly validator: TValidator, options?: TableDefinitionOptions) {
    this.options = options ?? {};
  }

  index(name: string, fields: string[]): this {
    this.indexes.push({ name, fields });
    return this;
  }

  searchIndex(
    name: string,
    config: { searchField: string; filterFields?: string[] }
  ): this {
    this.searchIndexes.push({
      name,
      searchField: config.searchField,
      filterFields: config.filterFields ?? []
    });
    return this;
  }
}

export type AnyTableDefinition = TableDefinition<Validator<unknown>>;

export type InferDocument<TTable extends AnyTableDefinition> = Infer<
  TTable["validator"]
> &
  TableDocumentSystemFields;

export type InferTableInput<TTable extends AnyTableDefinition> = Omit<
  InferDocument<TTable>,
  keyof TableDocumentSystemFields
>;

export function defineTable<TShape extends ObjectValidatorShape>(
  validator: TShape
): TableDefinition<ObjectValidator<TShape>>;
export function defineTable<TValidator extends Validator<unknown>>(
  validator: TValidator
): TableDefinition<TValidator>;
export function defineTable<TShape extends ObjectValidatorShape>(
  validator: TShape | Validator<unknown>
): TableDefinition<Validator<unknown>> {
  return new TableDefinition(ensureObjectValidator(validator));
}

export interface SyncoreSchemaDefinition {
  [tableName: string]: AnyTableDefinition;
}

export class SyncoreSchema<TTables extends SyncoreSchemaDefinition> {
  constructor(public readonly tables: TTables) {}

  getTable<TTableName extends Extract<keyof TTables, string>>(
    tableName: TTableName
  ): TTables[TTableName] {
    const table = this.tables[tableName];
    if (!table) {
      throw new Error(`Unknown table "${tableName}".`);
    }
    return table;
  }

  tableNames(): Array<Extract<keyof TTables, string>> {
    return Object.keys(this.tables) as Array<Extract<keyof TTables, string>>;
  }
}

export function defineSchema<TTables extends SyncoreSchemaDefinition>(
  tables: TTables
): SyncoreSchema<TTables> {
  return new SyncoreSchema(tables);
}
