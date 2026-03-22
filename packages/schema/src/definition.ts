import {
  describeValidator,
  deserializeValue,
  ensureObjectValidator,
  serializeValue,
  type FieldPaths,
  type Infer,
  type InferStorage,
  type ObjectValidator,
  type ObjectValidatorShape,
  type Validator
} from "./validators.js";

type Expand<T> = { [TKey in keyof T]: T[TKey] } & {};

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
  componentPath?: string;
  componentName?: string;
}

export interface TableDocumentSystemFields {
  _id: string;
  _creationTime: number;
}

export type GenericTableIndexes = Record<string, readonly string[]>;

export type GenericTableSearchIndexes = Record<
  string,
  {
    searchField: string;
    filterFields: string;
  }
>;

export class TableDefinition<
  TValidator extends Validator<Record<string, unknown>, Record<string, unknown>, string>,
  TIndexes = Record<never, never>,
  TSearchIndexes = Record<never, never>
> {
  readonly indexes: IndexDefinition[] = [];
  readonly searchIndexes: SearchIndexDefinition[] = [];
  readonly options: TableDefinitionOptions;

  declare readonly document: Infer<TValidator>;
  declare readonly storageDocument: InferStorage<TValidator>;
  declare readonly fieldPaths: FieldPaths<TValidator>;
  declare readonly indexesByName: TIndexes;
  declare readonly searchIndexesByName: TSearchIndexes;

  constructor(
    public readonly validator: TValidator,
    options?: TableDefinitionOptions
  ) {
    this.options = options ?? {};
  }

  index<
    const TIndexName extends string,
    TFirstField extends FieldPaths<TValidator>,
    TRestFields extends FieldPaths<TValidator>[]
  >(
    name: TIndexName,
    fields: [TFirstField, ...TRestFields]
  ): TableDefinition<
    TValidator,
    Expand<TIndexes & Record<TIndexName, readonly [TFirstField, ...TRestFields]>>,
    TSearchIndexes
  > {
    this.indexes.push({
      name,
      fields: [...fields]
    });
    return this as unknown as TableDefinition<
      TValidator,
      Expand<TIndexes & Record<TIndexName, readonly [TFirstField, ...TRestFields]>>,
      TSearchIndexes
    >;
  }

  searchIndex<
    const TIndexName extends string,
    TSearchField extends FieldPaths<TValidator>,
    TFilterField extends FieldPaths<TValidator> = never
  >(
    name: TIndexName,
    config: {
      searchField: TSearchField;
      filterFields?: TFilterField[];
    }
  ): TableDefinition<
    TValidator,
    TIndexes,
    Expand<
      TSearchIndexes &
        Record<
          TIndexName,
          {
            searchField: TSearchField;
            filterFields: TFilterField;
          }
        >
    >
  > {
    this.searchIndexes.push({
      name,
      searchField: config.searchField,
      filterFields: [...(config.filterFields ?? [])]
    });
    return this as unknown as TableDefinition<
      TValidator,
      TIndexes,
      Expand<
        TSearchIndexes &
          Record<
            TIndexName,
            {
              searchField: TSearchField;
              filterFields: TFilterField;
            }
          >
      >
    >;
  }

  parse(value: unknown): Infer<TValidator> {
    return this.validator.parse(value) as Infer<TValidator>;
  }

  serialize(value: Infer<TValidator>): InferStorage<TValidator> {
    return serializeValue(this.validator, value) as InferStorage<TValidator>;
  }

  deserialize(value: unknown): Infer<TValidator> {
    return deserializeValue(this.validator, value) as Infer<TValidator>;
  }

  parseAndSerialize(value: unknown): InferStorage<TValidator> {
    return this.serialize(this.parse(value));
  }

  describe() {
    return describeValidator(this.validator);
  }
}

export type AnyTableDefinition = TableDefinition<
  Validator<Record<string, unknown>, Record<string, unknown>, string>,
  GenericTableIndexes,
  GenericTableSearchIndexes
>;

export type InferDocument<TTable extends AnyTableDefinition> = Infer<
  TTable["validator"]
> &
  TableDocumentSystemFields;

export type InferTableInput<TTable extends AnyTableDefinition> = Infer<
  TTable["validator"]
>;

export type TableFieldPaths<TTable> = TTable extends TableDefinition<
  infer TValidator,
  unknown,
  unknown
>
  ? FieldPaths<TValidator>
  : never;

export type TableIndexes<TTable> = TTable extends TableDefinition<
  Validator<Record<string, unknown>, Record<string, unknown>, string>,
  infer TIndexes,
  unknown
>
  ? TIndexes
  : never;

export type TableSearchIndexes<TTable> = TTable extends TableDefinition<
  Validator<Record<string, unknown>, Record<string, unknown>, string>,
  unknown,
  infer TSearchIndexes
>
  ? TSearchIndexes
  : never;

export type TableIndexNames<TTable> = Extract<
  keyof TableIndexes<TTable>,
  string
>;

export type TableSearchIndexNames<TTable> = Extract<
  keyof TableSearchIndexes<TTable>,
  string
>;

export type TableIndexFields<
  TTable,
  TIndexName extends TableIndexNames<TTable>
> = TableIndexes<TTable>[TIndexName];

export type TableSearchIndexConfig<
  TTable,
  TIndexName extends TableSearchIndexNames<TTable>
> = TableSearchIndexes<TTable>[TIndexName];

export type TableFieldDefinitionSummary = {
  name: string;
  validator: ReturnType<AnyTableDefinition["describe"]>;
  storage: ReturnType<AnyTableDefinition["describe"]>;
  optional: boolean;
};

export function defineTable<const TShape extends ObjectValidatorShape>(
  validator: TShape
): TableDefinition<ObjectValidator<TShape>>;
export function defineTable<
  TValidator extends Validator<Record<string, unknown>, Record<string, unknown>, string>
>(validator: TValidator): TableDefinition<TValidator>;
export function defineTable<const TShape extends ObjectValidatorShape>(
  validator:
    | TShape
    | Validator<Record<string, unknown>, Record<string, unknown>, string>
): TableDefinition<
  Validator<Record<string, unknown>, Record<string, unknown>, string>
> {
  const normalized: Validator<Record<string, unknown>, Record<string, unknown>, string> =
    isValidatorLike(validator)
    ? validator
    : ensureObjectValidator(validator);
  return new TableDefinition(normalized);
}

export interface SyncoreSchemaDefinition {
  [tableName: string]: AnyTableDefinition;
}

export class SyncoreSchema<TTables> {
  constructor(public readonly tables: TTables) {}

  getTable<TTableName extends Extract<keyof TTables, string>>(
    tableName: TTableName
  ): TTables[TTableName] {
    const tables = this.tables as Record<string, unknown>;
    const table = tables[tableName];
    if (!table) {
      throw new Error(`Unknown table "${tableName}".`);
    }
    return table as TTables[TTableName];
  }

  tableNames(): Array<Extract<keyof TTables, string>> {
    return Object.keys(this.tables as Record<string, unknown>) as Array<
      Extract<keyof TTables, string>
    >;
  }
}

export function defineSchema<const TTables extends SyncoreSchemaDefinition>(
  tables: TTables
): SyncoreSchema<TTables> {
  return new SyncoreSchema(tables);
}

function isValidatorLike(
  value: Validator<Record<string, unknown>, Record<string, unknown>, string> | ObjectValidatorShape
): value is Validator<Record<string, unknown>, Record<string, unknown>, string> {
  return typeof (value as Validator<unknown, unknown, string>).parse === "function";
}
