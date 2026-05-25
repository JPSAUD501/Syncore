type Expand<T> = { [TKey in keyof T]: T[TKey] } & {};

export type ValidatorKind =
  | "string"
  | "number"
  | "boolean"
  | "literal"
  | "enum"
  | "array"
  | "object"
  | "record"
  | "union"
  | "id"
  | "optional"
  | "any"
  | "null"
  | "codec";

/**
 * A schema field definition that combines validation, serialisation, and
 * field-path metadata for Syncore’s data model.
 *
 * Every type in the `s.*` builder namespace produces a `Validator`. You attach
 * validators to table definitions via {@link defineTable} and to function
 * arguments via the `args` field of {@link query}, {@link mutation}, and
 * {@link action}.
 *
 * ```ts
 * const titleValidator = s.string();       // Validator<string>
 * const tagsValidator  = s.array(s.string()); // Validator<string[]>
 * ```
 *
 * Validators carry three type parameters:
 * - `TValue` — the TypeScript type after parsing (used in application code).
 * - `TStorage` — the serialised representation stored in SQLite (may differ
 *   for codec validators).
 * - `TFieldPaths` — dotted paths to nested fields, used by the query builder
 *   for type-safe index and search-index references.
 */
export interface Validator<
  TValue = unknown,
  TStorage = TValue,
  TFieldPaths extends string = never
> {
  readonly kind: ValidatorKind;
  readonly fieldPaths?: TFieldPaths;
  parse(value: unknown, path?: string): TValue;
  serialize?(value: TValue, path?: string): TStorage;
  deserialize?(value: unknown, path?: string): TValue;
  describe?(): ValidatorDescription;
}

export type ValidatorDescription =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "any" }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "enum"; values: string[] }
  | { kind: "array"; item: ValidatorDescription }
  | {
      kind: "object";
      shape: Record<
        string,
        {
          validator: ValidatorDescription;
          optional: boolean;
        }
      >;
    }
  | { kind: "record"; key: ValidatorDescription; value: ValidatorDescription }
  | { kind: "union"; members: ValidatorDescription[] }
  | { kind: "id"; tableName: string }
  | { kind: "optional"; inner: ValidatorDescription }
  | {
      kind: "codec";
      value: ValidatorDescription;
      storage: ValidatorDescription;
    };

export type Infer<TValidator> =
  TValidator extends Validator<infer TValue, unknown, string> ? TValue : never;

export type InferStorage<TValidator> =
  TValidator extends Validator<unknown, infer TStorage, string>
    ? TStorage
    : never;

export type FieldPaths<TValidator> =
  TValidator extends Validator<unknown, unknown, infer TFieldPaths>
    ? TFieldPaths
    : never;

export interface ObjectValidatorShape {
  [key: string]: Validator<unknown, unknown, string>;
}

export type ValidatorMap = Record<string, Validator<unknown, unknown, string>>;

type OptionalKeys<TShape extends ObjectValidatorShape> = {
  [TKey in keyof TShape]:
    TShape[TKey] extends OptionalValidator<unknown, unknown, string>
      ? TKey
      : never;
}[keyof TShape];

type RequiredKeys<TShape extends ObjectValidatorShape> = Exclude<
  keyof TShape,
  OptionalKeys<TShape>
>;

type InferObject<TShape extends ObjectValidatorShape> = Expand<
  {
    [TKey in OptionalKeys<TShape>]?: Exclude<Infer<TShape[TKey]>, undefined>;
  } & {
    [TKey in RequiredKeys<TShape>]: Infer<TShape[TKey]>;
  }
>;

type InferStoredObject<TShape extends ObjectValidatorShape> = Expand<
  {
    [TKey in OptionalKeys<TShape>]?: Exclude<
      InferStorage<TShape[TKey]>,
      undefined
    >;
  } & {
    [TKey in RequiredKeys<TShape>]: InferStorage<TShape[TKey]>;
  }
>;

export type JoinFieldPaths<
  TStart extends string,
  TEnd extends string
> = `${TStart}.${TEnd}`;

type ShapeFieldPaths<TShape extends ObjectValidatorShape> = {
  [TKey in keyof TShape & string]: FieldPaths<TShape[TKey]> extends never
    ? TKey
    : TKey | JoinFieldPaths<TKey, FieldPaths<TShape[TKey]>>;
}[keyof TShape & string];

abstract class BaseValidator<
  TValue,
  TStorage = TValue,
  TFieldPaths extends string = never
> implements Validator<TValue, TStorage, TFieldPaths> {
  declare readonly fieldPaths: TFieldPaths;

  constructor(public readonly kind: ValidatorKind) {}

  abstract parse(value: unknown, path?: string): TValue;

  serialize(value: TValue, path = "value"): TStorage {
    return this.parse(value, path) as unknown as TStorage;
  }

  deserialize(value: unknown, path = "value"): TValue {
    return this.parse(value, path);
  }

  abstract describe(): ValidatorDescription;
}

export class StringValidator extends BaseValidator<string> {
  constructor() {
    super("string");
  }

  parse(value: unknown, path = "value"): string {
    if (typeof value !== "string") {
      throw new Error(`${path} must be a string.`);
    }
    return value;
  }

  describe(): ValidatorDescription {
    return { kind: "string" };
  }
}

export class NumberValidator extends BaseValidator<number> {
  constructor() {
    super("number");
  }

  parse(value: unknown, path = "value"): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`${path} must be a number.`);
    }
    return value;
  }

  describe(): ValidatorDescription {
    return { kind: "number" };
  }
}

export class BooleanValidator extends BaseValidator<boolean> {
  constructor() {
    super("boolean");
  }

  parse(value: unknown, path = "value"): boolean {
    if (typeof value !== "boolean") {
      throw new Error(`${path} must be a boolean.`);
    }
    return value;
  }

  describe(): ValidatorDescription {
    return { kind: "boolean" };
  }
}

export class NullValidator extends BaseValidator<null> {
  constructor() {
    super("null");
  }

  parse(value: unknown, path = "value"): null {
    if (value !== null) {
      throw new Error(`${path} must be null.`);
    }
    return null;
  }

  describe(): ValidatorDescription {
    return { kind: "null" };
  }
}

export class AnyValidator extends BaseValidator<unknown, unknown, never> {
  constructor() {
    super("any");
  }

  parse(value: unknown): unknown {
    return value;
  }

  describe(): ValidatorDescription {
    return { kind: "any" };
  }
}

export class LiteralValidator<
  TValue extends string | number | boolean | null
> extends BaseValidator<TValue> {
  constructor(public readonly literalValue: TValue) {
    super("literal");
  }

  parse(value: unknown, path = "value"): TValue {
    if (value !== this.literalValue) {
      throw new Error(`${path} must equal ${String(this.literalValue)}.`);
    }
    return this.literalValue;
  }

  describe(): ValidatorDescription {
    return {
      kind: "literal",
      value: this.literalValue
    };
  }
}

export class EnumValidator<
  TValues extends readonly [string, ...string[]]
> extends BaseValidator<TValues[number]> {
  constructor(public readonly values: TValues) {
    super("enum");
  }

  parse(value: unknown, path = "value"): TValues[number] {
    if (typeof value !== "string" || !this.values.includes(value)) {
      throw new Error(
        `${path} must be one of ${this.values.map((item) => JSON.stringify(item)).join(", ")}.`
      );
    }
    return value;
  }

  describe(): ValidatorDescription {
    return {
      kind: "enum",
      values: [...this.values]
    };
  }
}

export class ArrayValidator<
  TItem,
  TItemStorage,
  TItemValidator extends Validator<TItem, TItemStorage, string>
> extends BaseValidator<TItem[], TItemStorage[], never> {
  constructor(public readonly itemValidator: TItemValidator) {
    super("array");
  }

  parse(value: unknown, path = "value"): TItem[] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array.`);
    }
    return value.map((item, index) =>
      this.itemValidator.parse(item, `${path}[${index}]`)
    );
  }

  override serialize(value: TItem[], path = "value"): TItemStorage[] {
    const parsed = this.parse(value, path);
    return parsed.map((item, index) =>
      serializeValue(this.itemValidator, item, `${path}[${index}]`)
    );
  }

  override deserialize(value: unknown, path = "value"): TItem[] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array.`);
    }
    return value.map((item, index) =>
      deserializeValue(this.itemValidator, item, `${path}[${index}]`)
    );
  }

  describe(): ValidatorDescription {
    return {
      kind: "array",
      item: describeValidator(this.itemValidator)
    };
  }
}

export class ObjectValidator<
  TShape extends ObjectValidatorShape
> extends BaseValidator<
  InferObject<TShape>,
  InferStoredObject<TShape>,
  ShapeFieldPaths<TShape>
> {
  constructor(public readonly shape: TShape) {
    super("object");
  }

  parse(value: unknown, path = "value"): InferObject<TShape> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be an object.`);
    }

    const source = value as Record<string, unknown>;
    const parsed: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(this.shape)) {
      if (validator.kind === "optional" && source[key] === undefined) {
        continue;
      }
      parsed[key] = validator.parse(source[key], `${path}.${key}`);
    }

    return parsed as InferObject<TShape>;
  }

  override serialize(
    value: InferObject<TShape>,
    path = "value"
  ): InferStoredObject<TShape> {
    const parsed = this.parse(value, path) as Record<string, unknown>;
    const serialized: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(this.shape)) {
      if (parsed[key] === undefined && validator.kind === "optional") {
        continue;
      }
      serialized[key] = serializeValue(
        validator,
        parsed[key],
        `${path}.${key}`
      );
    }

    return serialized as InferStoredObject<TShape>;
  }

  override deserialize(value: unknown, path = "value"): InferObject<TShape> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be an object.`);
    }

    const source = value as Record<string, unknown>;
    const parsed: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(this.shape)) {
      if (validator.kind === "optional" && source[key] === undefined) {
        continue;
      }
      parsed[key] = deserializeValue(validator, source[key], `${path}.${key}`);
    }

    return parsed as InferObject<TShape>;
  }

  describe(): ValidatorDescription {
    return {
      kind: "object",
      shape: Object.fromEntries(
        Object.entries(this.shape).map(([key, validator]) => [
          key,
          {
            validator:
              validator.kind === "optional"
                ? describeValidator(
                    (validator as OptionalValidator<unknown, unknown, string>).inner
                  )
                : describeValidator(validator),
            optional: validator.kind === "optional"
          }
        ])
      )
    };
  }
}

export class IdValidator<
  TTableName extends string
> extends BaseValidator<string> {
  constructor(public readonly tableName: TTableName) {
    super("id");
  }

  parse(value: unknown, path = "value"): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${path} must be a non-empty id string.`);
    }
    return value;
  }

  describe(): ValidatorDescription {
    return {
      kind: "id",
      tableName: this.tableName
    };
  }
}

export class OptionalValidator<
  TValue,
  TStorage = TValue,
  TFieldPaths extends string = never
> extends BaseValidator<
  TValue | undefined,
  TStorage | undefined,
  TFieldPaths
> {
  constructor(public readonly inner: Validator<TValue, TStorage, TFieldPaths>) {
    super("optional");
  }

  parse(value: unknown, path = "value"): TValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.inner.parse(value, path);
  }

  override serialize(
    value: TValue | undefined,
    path = "value"
  ): TStorage | undefined {
    if (value === undefined) {
      return undefined;
    }
    return serializeValue(this.inner, value, path);
  }

  override deserialize(
    value: unknown,
    path = "value"
  ): TValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return deserializeValue(this.inner, value, path);
  }

  describe(): ValidatorDescription {
    return {
      kind: "optional",
      inner: describeValidator(this.inner)
    };
  }
}

export class RecordValidator<
  TKey extends string,
  TValue,
  TStorage,
  TKeyValidator extends Validator<TKey, string, string>,
  TValueValidator extends Validator<TValue, TStorage, string>
> extends BaseValidator<Record<TKey, TValue>, Record<TKey, TStorage>, never> {
  constructor(
    public readonly keyValidator: TKeyValidator,
    public readonly valueValidator: TValueValidator
  ) {
    super("record");
  }

  parse(value: unknown, path = "value"): Record<TKey, TValue> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be an object.`);
    }
    const source = value as Record<string, unknown>;
    const parsed: Record<string, TValue> = {};
    for (const [key, item] of Object.entries(source)) {
      const parsedKey = this.keyValidator.parse(key, `${path}.{key}`);
      parsed[parsedKey] = this.valueValidator.parse(item, `${path}.${key}`);
    }
    return parsed;
  }

  override serialize(
    value: Record<TKey, TValue>,
    path = "value"
  ): Record<TKey, TStorage> {
    const parsed = this.parse(value, path);
    const serialized: Record<string, TStorage> = {};
    for (const [key, item] of Object.entries(parsed)) {
      serialized[key] = serializeValue(this.valueValidator, item, `${path}.${key}`);
    }
    return serialized;
  }

  override deserialize(
    value: unknown,
    path = "value"
  ): Record<TKey, TValue> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be an object.`);
    }
    const source = value as Record<string, unknown>;
    const parsed: Record<string, TValue> = {};
    for (const [key, item] of Object.entries(source)) {
      const parsedKey = this.keyValidator.parse(key, `${path}.{key}`);
      parsed[parsedKey] = deserializeValue(
        this.valueValidator,
        item,
        `${path}.${key}`
      );
    }
    return parsed;
  }

  describe(): ValidatorDescription {
    return {
      kind: "record",
      key: describeValidator(this.keyValidator),
      value: describeValidator(this.valueValidator)
    };
  }
}

export class UnionValidator<
  TMembers extends readonly Validator<unknown, unknown, string>[]
> extends BaseValidator<
  Infer<TMembers[number]>,
  InferStorage<TMembers[number]>,
  FieldPaths<TMembers[number]>
> {
  constructor(public readonly members: TMembers) {
    super("union");
  }

  parse(value: unknown, path = "value"): Infer<TMembers[number]> {
    for (const member of this.members) {
      try {
        return member.parse(value, path) as Infer<TMembers[number]>;
      } catch {
        continue;
      }
    }
    throw new Error(`${path} did not match any union member.`);
  }

  override serialize(
    value: Infer<TMembers[number]>,
    path = "value"
  ): InferStorage<TMembers[number]> {
    for (const member of this.members) {
      try {
        const parsed = member.parse(value, path);
        return serializeValue(
          member as Validator<
            Infer<TMembers[number]>,
            InferStorage<TMembers[number]>,
            string
          >,
          parsed,
          path
        ) as InferStorage<TMembers[number]>;
      } catch {
        continue;
      }
    }
    throw new Error(`${path} did not match any union member.`);
  }

  override deserialize(
    value: unknown,
    path = "value"
  ): Infer<TMembers[number]> {
    for (const member of this.members) {
      try {
        return deserializeValue(
          member as Validator<Infer<TMembers[number]>, InferStorage<TMembers[number]>, string>,
          value,
          path
        );
      } catch {
        continue;
      }
    }
    throw new Error(`${path} did not match any union member.`);
  }

  describe(): ValidatorDescription {
    return {
      kind: "union",
      members: this.members.map((member) => describeValidator(member))
    };
  }
}

export class CodecValidator<
  TValue,
  TStored,
  TStorageFieldValidator extends Validator<TStored, unknown, string>,
  TValueFieldValidator extends Validator<TValue, unknown, string>
> extends BaseValidator<
  TValue,
  InferStorage<TStorageFieldValidator>,
  FieldPaths<TValueFieldValidator>
> {
  constructor(
    public readonly valueValidator: TValueFieldValidator,
    public readonly storageValidator: TStorageFieldValidator,
    private readonly codec: {
      serialize(value: TValue): TStored;
      deserialize(value: TStored): TValue;
    }
  ) {
    super("codec");
  }

  parse(value: unknown, path = "value"): TValue {
    return this.valueValidator.parse(value, path);
  }

  override serialize(
    value: TValue,
    path = "value"
  ): InferStorage<TStorageFieldValidator> {
    const parsed = this.valueValidator.parse(value, path);
    const serialized = this.codec.serialize(parsed);
    return serializeValue(
      this.storageValidator,
      this.storageValidator.parse(serialized, path),
      path
    ) as InferStorage<TStorageFieldValidator>;
  }

  override deserialize(value: unknown, path = "value"): TValue {
    const parsedStored = deserializeValue(this.storageValidator, value, path);
    return this.valueValidator.parse(
      this.codec.deserialize(parsedStored),
      path
    );
  }

  describe(): ValidatorDescription {
    return {
      kind: "codec",
      value: describeValidator(this.valueValidator),
      storage: describeValidator(this.storageValidator)
    };
  }
}

/**
 * Describes every method available on the `s` schema builder.
 *
 * You interact with this through the singleton {@link s} object rather than
 * implementing this interface yourself.
 */
export interface ValidatorBuilderApi {
  /**
   * Validates that the value is a `string`.
   *
   * ```ts
   * const v = s.string(); // Validator<string>
   * ```
   */
  string(): StringValidator;
  /**
   * Validates that the value is a finite `number` (rejects `NaN`).
   *
   * ```ts
   * const v = s.number(); // Validator<number>
   * ```
   */
  number(): NumberValidator;
  /**
   * Validates that the value is a `boolean`.
   *
   * ```ts
   * const v = s.boolean(); // Validator<boolean>
   * ```
   */
  boolean(): BooleanValidator;
  /**
   * Validates that the value is exactly `null`.
   *
   * Usually combined with `s.union` — or use the convenience `s.nullable`
   * helper instead.
   */
  null(): NullValidator;
  /**
   * Accepts any value without validation.
   *
   * Use sparingly. Prefer typed validators wherever possible to preserve
   * type safety and devtools introspection.
   */
  any(): AnyValidator;
  /**
   * Validates that the value is exactly equal to `literalValue`.
   *
   * ```ts
   * const v = s.literal("active"); // Validator<"active">
   * ```
   */
  literal<TValue extends string | number | boolean | null>(
    literalValue: TValue
  ): LiteralValidator<TValue>;
  /**
   * Validates that the value is one of the provided string literals.
   *
   * Prefer this over `s.union(s.literal(…), …)` for string-enum fields
   * because it generates a cleaner schema description.
   *
   * ```ts
   * const v = s.enum(["todo", "in-progress", "done"] as const);
   * // Validator<"todo" | "in-progress" | "done">
   * ```
   */
  enum<TValues extends readonly [string, ...string[]]>(
    values: TValues
  ): EnumValidator<TValues>;
  /**
   * Validates that the value is an array where every item passes
   * `itemValidator`.
   *
   * ```ts
   * const v = s.array(s.string()); // Validator<string[]>
   * ```
   */
  array<
    TItem,
    TItemStorage,
    TValidator extends Validator<TItem, TItemStorage, string>
  >(itemValidator: TValidator): ArrayValidator<TItem, TItemStorage, TValidator>;
  /**
   * Validates that the value is a plain object matching `shape`.
   *
   * Keys whose validators are `s.optional(...)` become optional properties in
   * the inferred type.
   *
   * ```ts
   * const v = s.object({ x: s.number(), y: s.number() });
   * // Validator<{ x: number; y: number }>
   * ```
   */
  object<TShape extends ObjectValidatorShape>(
    shape: TShape
  ): ObjectValidator<TShape>;
  /**
   * Validates that the value is a non-empty string that represents a document
   * `_id` in `tableName`.
   *
   * Using `s.id` instead of `s.string` for foreign-key fields enables devtools
   * to show relationships between tables.
   *
   * ```ts
   * const v = s.id("projects"); // Validator<string> (typed as a projects ID)
   * ```
   */
  id<TTableName extends string>(tableName: TTableName): IdValidator<TTableName>;
  /**
   * Makes a field optional (the value can be `undefined` / absent).
   *
   * Only use inside `s.object()` shapes or as a top-level table field. Nesting
   * `s.optional` inside a non-object validator has no practical effect.
   *
   * ```ts
   * const v = s.object({ name: s.string(), bio: s.optional(s.string()) });
   * // Validator<{ name: string; bio?: string }>
   * ```
   */
  optional<TValue, TStorage, TFieldPaths extends string>(
    inner: Validator<TValue, TStorage, TFieldPaths>
  ): OptionalValidator<TValue, TStorage, TFieldPaths>;
  /**
   * Validates that the value is a `Record<TKey, TValue>` (an object with
   * dynamic keys of a specific type).
   *
   * ```ts
   * const v = s.record(s.string(), s.number()); // Validator<Record<string, number>>
   * ```
   */
  record<
    TKey extends string,
    TValue,
    TStorage,
    TKeyValidator extends Validator<TKey, string, string>,
    TValueValidator extends Validator<TValue, TStorage, string>
  >(
    keyValidator: TKeyValidator,
    valueValidator: TValueValidator
  ): RecordValidator<TKey, TValue, TStorage, TKeyValidator, TValueValidator>;
  /**
   * Validates that the value matches **one** of the provided validators
   * (discriminated union).
   *
   * Validators are tried in order; the first one that parses without throwing
   * wins.
   *
   * ```ts
   * const v = s.union(s.string(), s.number()); // Validator<string | number>
   * ```
   */
  union<
    TMembers extends readonly Validator<unknown, unknown, string>[]
  >(...members: TMembers): UnionValidator<TMembers>;
  /**
   * Convenience wrapper for `s.union(inner, s.null())` that types the field
   * as `TValue | null`.
   *
   * ```ts
   * const v = s.nullable(s.id("projects")); // Validator<string | null>
   * ```
   */
  nullable<TValue, TStorage, TFieldPaths extends string>(
    inner: Validator<TValue, TStorage, TFieldPaths>
  ): UnionValidator<
    readonly [Validator<TValue, TStorage, TFieldPaths>, NullValidator]
  >;
  /**
   * Creates a custom codec that stores a field as one type but exposes it as
   * another.
   *
   * Useful for types that are not natively serialisable to JSON (e.g. `Date`,
   * `Map`, binary IDs). The codec’s `serialize` / `deserialize` functions
   * convert between the runtime value and the stored representation.
   *
   * ```ts
   * const dateValidator = s.codec(s.string(), {
   *   storage: s.number(),
   *   serialize: (date: string) => new Date(date).getTime(),
   *   deserialize: (ts: number)  => new Date(ts).toISOString(),
   * });
   * ```
   */
  codec<
    TValue,
    TStored,
    TStorageFieldValidator extends Validator<TStored, unknown, string>,
    TValueFieldValidator extends Validator<TValue, unknown, string>
  >(
    valueValidator: TValueFieldValidator,
    config: {
      storage: TStorageFieldValidator;
      serialize(value: TValue): TStored;
      deserialize(value: TStored): TValue;
    }
  ): CodecValidator<
    TValue,
    TStored,
    TStorageFieldValidator,
    TValueFieldValidator
  >;
}

/**
 * Primary schema builder for Syncore’s data-model DSL.
 *
 * `s` is a namespace of factory functions for creating typed field validators.
 * Use it when defining table schemas with {@link defineTable} and when
 * declaring function argument shapes with {@link query}, {@link mutation}, or
 * {@link action}.
 *
 * ```ts
 * import { defineTable, defineSchema, s } from "syncorejs";
 *
 * export default defineSchema({
 *   tasks: defineTable({
 *     title:     s.string(),
 *     status:    s.enum(["todo", "done"] as const),
 *     projectId: s.nullable(s.id("projects")),
 *     tags:      s.optional(s.array(s.string())),
 *     metadata:  s.optional(s.object({ priority: s.number() })),
 *   })
 *   .index("by_status", ["status"])
 *   .searchIndex("search_title", { searchField: "title", filterFields: ["status"] }),
 * });
 * ```
 */
export const s: ValidatorBuilderApi = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  boolean: () => new BooleanValidator(),
  null: () => new NullValidator(),
  any: () => new AnyValidator(),
  literal: <TValue extends string | number | boolean | null>(
    literalValue: TValue
  ) => new LiteralValidator(literalValue),
  enum: <TValues extends readonly [string, ...string[]]>(values: TValues) =>
    new EnumValidator(values),
  array: <
    TItem,
    TItemStorage,
    TValidator extends Validator<TItem, TItemStorage, string>
  >(
    itemValidator: TValidator
  ) =>
    new ArrayValidator(itemValidator) as ArrayValidator<TItem, TItemStorage, TValidator>,
  object: <TShape extends ObjectValidatorShape>(shape: TShape) =>
    new ObjectValidator(shape),
  id: <TTableName extends string>(tableName: TTableName) =>
    new IdValidator(tableName),
  optional: <TValue, TStorage, TFieldPaths extends string>(
    inner: Validator<TValue, TStorage, TFieldPaths>
  ) => new OptionalValidator(inner),
  record: <
    TKey extends string,
    TValue,
    TStorage,
    TKeyValidator extends Validator<TKey, string, string>,
    TValueValidator extends Validator<TValue, TStorage, string>
  >(
    keyValidator: TKeyValidator,
    valueValidator: TValueValidator
  ) =>
    new RecordValidator(keyValidator, valueValidator) as RecordValidator<
      TKey,
      TValue,
      TStorage,
      TKeyValidator,
      TValueValidator
    >,
  union: <TMembers extends readonly Validator<unknown, unknown, string>[]>(
    ...members: TMembers
  ) => new UnionValidator(members),
  nullable: <TValue, TStorage, TFieldPaths extends string>(
    inner: Validator<TValue, TStorage, TFieldPaths>
  ) => new UnionValidator([inner, new NullValidator()] as const),
  codec: <
    TValue,
    TStored,
    TStorageFieldValidator extends Validator<TStored, unknown, string>,
    TValueFieldValidator extends Validator<TValue, unknown, string>
  >(
    valueValidator: TValueFieldValidator,
    config: {
      storage: TStorageFieldValidator;
      serialize(value: TValue): TStored;
      deserialize(value: TStored): TValue;
    }
  ) =>
    new CodecValidator(valueValidator, config.storage, {
      serialize: (value) => config.serialize(value),
      deserialize: (value) => config.deserialize(value)
    }) as CodecValidator<
      TValue,
      TStored,
      TStorageFieldValidator,
      TValueFieldValidator
    >
};

export function isValidator(
  value: Validator<unknown, unknown, string> | ValidatorMap
): value is Validator<unknown, unknown, string> {
  return typeof (value as Validator<unknown, unknown, string>).parse === "function";
}

export function ensureObjectValidator<TShape extends ObjectValidatorShape>(
  value: TShape
): ObjectValidator<TShape>;
export function ensureObjectValidator<TValidator extends Validator<unknown, unknown, string>>(
  value: TValidator
): TValidator;
export function ensureObjectValidator(
  value: Validator<unknown, unknown, string> | ValidatorMap
): Validator<unknown, unknown, string> {
  if (isValidator(value)) {
    return value;
  }
  return new ObjectValidator(value);
}

export function serializeValue<TValue, TStorage, TFieldPaths extends string>(
  validator: Validator<TValue, TStorage, TFieldPaths>,
  value: TValue,
  path = "value"
): TStorage {
  if (validator.serialize) {
    return validator.serialize(value, path);
  }
  return value as unknown as TStorage;
}

export function deserializeValue<
  TValue,
  TStorage,
  TFieldPaths extends string
>(
  validator: Validator<TValue, TStorage, TFieldPaths>,
  value: unknown,
  path = "value"
): TValue {
  if (validator.deserialize) {
    return validator.deserialize(value, path);
  }
  return validator.parse(value, path);
}

export function describeValidator(
  validator: Validator<unknown, unknown, string>
): ValidatorDescription {
  if (validator.describe) {
    return validator.describe();
  }

  switch (validator.kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
    case "any":
      return { kind: validator.kind };
    case "literal":
      return {
        kind: "literal",
        value: (validator as LiteralValidator<string | number | boolean | null>)
          .literalValue
      };
    case "enum":
      return {
        kind: "enum",
        values: [...(validator as EnumValidator<readonly [string, ...string[]]>).values]
      };
    case "array":
      return {
        kind: "array",
        item: describeValidator(
          (validator as ArrayValidator<unknown, unknown, Validator<unknown, unknown, string>>)
            .itemValidator
        )
      };
    case "object": {
      const objectShape =
        "shape" in validator
          ? (validator as {
              shape: Record<
                string,
                | Validator<unknown, unknown, string>
                | {
                    validator?: ValidatorDescription;
                    field?: ValidatorDescription;
                    optional?: boolean;
                  }
              >;
            }).shape
          : {};

      return {
        kind: "object",
        shape: Object.fromEntries(
          Object.entries(objectShape).map(([key, field]) => {
            if (isValidator(field as Validator<unknown, unknown, string>)) {
              return [
                key,
                {
                  validator:
                    (field as Validator<unknown, unknown, string>).kind === "optional"
                      ? describeValidator(
                          (
                            field as OptionalValidator<unknown, unknown, string>
                          ).inner
                        )
                      : describeValidator(
                          field as Validator<unknown, unknown, string>
                        ),
                  optional:
                    (field as Validator<unknown, unknown, string>).kind === "optional"
                }
              ];
            }
            const metadata = field as {
              validator?: ValidatorDescription;
              field?: ValidatorDescription;
              optional?: boolean;
            };
            return [
              key,
              {
                validator:
                  metadata.validator ??
                  metadata.field ??
                  ({ kind: "any" } satisfies ValidatorDescription),
                optional: metadata.optional ?? false
              }
            ];
          })
        )
      };
    }
    case "record":
      return {
        kind: "record",
        key: describeValidator(
          (validator as RecordValidator<
            string,
            unknown,
            unknown,
            Validator<string, string, string>,
            Validator<unknown, unknown, string>
          >).keyValidator
        ),
        value: describeValidator(
          (validator as RecordValidator<
            string,
            unknown,
            unknown,
            Validator<string, string, string>,
            Validator<unknown, unknown, string>
          >).valueValidator
        )
      };
    case "union":
      return {
        kind: "union",
        members: (
          validator as UnionValidator<readonly Validator<unknown, unknown, string>[]>
        ).members.map((member) => describeValidator(member))
      };
    case "id":
      return {
        kind: "id",
        tableName: (validator as IdValidator<string>).tableName
      };
    case "optional":
      return {
        kind: "optional",
        inner: describeValidator(
          (validator as OptionalValidator<unknown, unknown, string>).inner
        )
      };
    case "codec":
      return {
        kind: "codec",
        value: describeValidator(
          (validator as CodecValidator<
            unknown,
            unknown,
            Validator<unknown, unknown, string>,
            Validator<unknown, unknown, string>
          >).valueValidator
        ),
        storage: describeValidator(
          (validator as CodecValidator<
            unknown,
            unknown,
            Validator<unknown, unknown, string>,
            Validator<unknown, unknown, string>
          >).storageValidator
        )
      };
  }
}
