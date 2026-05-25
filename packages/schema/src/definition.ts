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

/**
 * The built-in system fields automatically added to every Syncore document.
 *
 * You never supply these when inserting; Syncore sets them for you.
 * - `_id` — A unique string identifier for the document. Use `s.id(tableName)` to
 *   type foreign-key fields that reference this value.
 * - `_creationTime` — Unix timestamp (milliseconds) when the document was inserted.
 */
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

/**
 * A typed table definition that describes the shape, indexes, and search
 * indexes for a single Syncore table.
 *
 * You create `TableDefinition` instances with {@link defineTable} and attach
 * indexes with the fluent `.index()` and `.searchIndex()` methods. The type
 * parameters track the validator shape, registered indexes, and search indexes
 * so that {@link QueryBuilder} can enforce correct field names at compile time.
 *
 * You almost never reference `TableDefinition` directly — it is the value
 * produced by `defineTable` and consumed internally by `defineSchema`.
 */
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

  /**
   * Register a named index on one or more fields of this table.
   *
   * Indexes allow efficient range queries via `ctx.db.query(table).withIndex()`.
   * The first field listed is the primary sort key; additional fields refine
   * within equal values of the first key.
   *
   * **Rules**
   * - An index must cover at least one field.
   * - Field names must be top-level paths that exist in the table validator.
   * - Index names must be unique within the table.
   * - Index definitions are immutable after creation — changing the fields of
   *   an existing index requires a manual migration.
   *
   * ```ts
   * defineTable({ status: s.string(), createdAt: s.number(), ownerId: s.string() })
   *   .index("by_owner_and_status", ["ownerId", "status"])
   *   .index("by_created",          ["createdAt"])
   * ```
   */
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

  /**
   * Register a named full-text search index on this table.
   *
   * Search indexes power `ctx.db.query(table).withSearchIndex()` queries. Each
   * search index specifies:
   * - A single `searchField` that is tokenised and indexed for full-text
   *   matching.
   * - Zero or more `filterFields` that can be used to narrow results with
   *   equality conditions.
   *
   * ```ts
   * defineTable({ title: s.string(), status: s.string(), ownerId: s.string() })
   *   .searchIndex("search_title", {
   *     searchField: "title",
   *     filterFields: ["status", "ownerId"],
   *   })
   * ```
   *
   * In a query handler:
   * ```ts
   * const results = await ctx.db
   *   .query("tasks")
   *   .withSearchIndex("search_title", (q) =>
   *     q.search("title", searchText).eq("status", "todo")
   *   )
   *   .collect();
   * ```
   */
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

/**
 * Define a Syncore table by specifying its field validators.
 *
 * `defineTable` is the building block of your data model. Pass a validator map
 * (keys are field names, values are `s.*` validators) or a single `s.object()`
 * validator. Chain `.index()` and `.searchIndex()` to register query indexes.
 *
 * The system fields `_id` and `_creationTime` are added automatically and
 * should not be included in the shape.
 *
 * ```ts
 * import { defineTable, s } from "syncorejs";
 *
 * const tasks = defineTable({
 *   title:     s.string(),
 *   status:    s.enum(["todo", "done"] as const),
 *   projectId: s.nullable(s.id("projects")),
 *   dueAt:     s.optional(s.number()),
 * })
 *   .index("by_project",     ["projectId"])
 *   .index("by_status",      ["status"])
 *   .searchIndex("search_title", { searchField: "title", filterFields: ["status"] });
 * ```
 */
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

/**
 * The typed data model produced by {@link defineSchema}.
 *
 * `SyncoreSchema` holds the table map and is the value you export from
 * `syncore/schema.ts`. The runtime, context types, and codegen all reference
 * this type to ensure end-to-end type safety between your schema definition
 * and your function handlers.
 */
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

/**
 * Define the complete data model for a Syncore app.
 *
 * Pass an object whose keys are table names and values are `defineTable()`
 * results. The resulting schema is passed to the runtime options and to the
 * code generator.
 *
 * **Typical file: `syncore/schema.ts`**
 *
 * ```ts
 * import { defineSchema, defineTable, s } from "syncorejs";
 *
 * export default defineSchema({
 *   tasks: defineTable({
 *     title:     s.string(),
 *     status:    s.enum(["todo", "done"] as const),
 *     projectId: s.nullable(s.id("projects")),
 *   })
 *   .index("by_project", ["projectId"]),
 *
 *   projects: defineTable({
 *     name:      s.string(),
 *     archivedAt: s.optional(s.number()),
 *   }),
 * });
 * ```
 *
 * @param tables - A map of table names to their `TableDefinition` values.
 */
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
