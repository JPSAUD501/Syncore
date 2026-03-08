export type ValidatorKind =
  | "string"
  | "number"
  | "boolean"
  | "literal"
  | "array"
  | "object"
  | "id"
  | "optional"
  | "any"
  | "null";

/**
 * Validates unknown input at runtime and carries its parsed TypeScript type.
 *
 * Syncore uses validators for function arguments, return values, and table
 * definitions. Most apps create validators through {@link v} instead of
 * instantiating validator classes directly.
 */
export interface Validator<TValue> {
  readonly kind: ValidatorKind;

  /**
   * Parse and validate an unknown value.
   *
   * @param value - The value to validate.
   * @param path - A human-readable path used in validation errors.
   * @returns The parsed value when validation succeeds.
   */
  parse(value: unknown, path?: string): TValue;
}

export type ValidatorDescription =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "null" }
  | { kind: "any" }
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "array"; item: ValidatorDescription }
  | { kind: "object"; shape: Record<string, ValidatorDescription> }
  | { kind: "id"; tableName: string }
  | { kind: "optional"; inner: ValidatorDescription };

export interface ObjectValidatorShape {
  [key: string]: Validator<unknown>;
}

export class StringValidator implements Validator<string> {
  readonly kind = "string" as const;

  parse(value: unknown, path = "value"): string {
    if (typeof value !== "string") {
      throw new Error(`${path} must be a string.`);
    }
    return value;
  }
}

export class NumberValidator implements Validator<number> {
  readonly kind = "number" as const;

  parse(value: unknown, path = "value"): number {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`${path} must be a number.`);
    }
    return value;
  }
}

export class BooleanValidator implements Validator<boolean> {
  readonly kind = "boolean" as const;

  parse(value: unknown, path = "value"): boolean {
    if (typeof value !== "boolean") {
      throw new Error(`${path} must be a boolean.`);
    }
    return value;
  }
}

export class NullValidator implements Validator<null> {
  readonly kind = "null" as const;

  parse(value: unknown, path = "value"): null {
    if (value !== null) {
      throw new Error(`${path} must be null.`);
    }
    return null;
  }
}

export class AnyValidator implements Validator<unknown> {
  readonly kind = "any" as const;

  parse(value: unknown): unknown {
    return value;
  }
}

export class LiteralValidator<
  TValue extends string | number | boolean | null
> implements Validator<TValue> {
  readonly kind = "literal" as const;

  constructor(public readonly literalValue: TValue) {}

  parse(value: unknown, path = "value"): TValue {
    if (value !== this.literalValue) {
      throw new Error(`${path} must equal ${String(this.literalValue)}.`);
    }
    return this.literalValue;
  }
}

export class ArrayValidator<TItem> implements Validator<TItem[]> {
  readonly kind = "array" as const;

  constructor(public readonly itemValidator: Validator<TItem>) {}

  parse(value: unknown, path = "value"): TItem[] {
    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array.`);
    }
    return value.map((item, index) =>
      this.itemValidator.parse(item, `${path}[${index}]`)
    );
  }
}

export class ObjectValidator<
  TShape extends ObjectValidatorShape
> implements Validator<{ [TKey in keyof TShape]: Infer<TShape[TKey]> }> {
  readonly kind = "object" as const;

  constructor(public readonly shape: TShape) {}

  parse(
    value: unknown,
    path = "value"
  ): { [TKey in keyof TShape]: Infer<TShape[TKey]> } {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be an object.`);
    }

    const source = value as Record<string, unknown>;
    const parsed: Record<string, unknown> = {};

    for (const [key, validator] of Object.entries(this.shape)) {
      const optional =
        validator.kind === "optional" && source[key] === undefined;
      if (optional) {
        continue;
      }
      parsed[key] = validator.parse(source[key], `${path}.${key}`);
    }

    return parsed as { [TKey in keyof TShape]: Infer<TShape[TKey]> };
  }
}

export class IdValidator<
  TTableName extends string
> implements Validator<string> {
  readonly kind = "id" as const;

  constructor(public readonly tableName: TTableName) {}

  parse(value: unknown, path = "value"): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${path} must be a non-empty id string.`);
    }
    return value;
  }
}

export class OptionalValidator<TValue> implements Validator<
  TValue | undefined
> {
  readonly kind = "optional" as const;

  constructor(public readonly inner: Validator<TValue>) {}

  parse(value: unknown, path = "value"): TValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.inner.parse(value, path);
  }
}

export type Infer<TValidator> =
  TValidator extends Validator<infer TValue> ? TValue : never;

export type ValidatorMap = Record<string, Validator<unknown>>;

/**
 * The public validator builder API.
 *
 * Hover each property in your editor to see what it validates and how to use it.
 */
export interface ValidatorBuilderApi {
  /**
   * Validate a string value.
   *
   * @returns A validator that accepts JavaScript strings.
   */
  string(): StringValidator;

  /**
   * Validate a number value.
   *
   * @returns A validator that accepts finite JavaScript numbers.
   */
  number(): NumberValidator;

  /**
   * Validate a boolean value.
   *
   * @returns A validator that accepts `true` and `false`.
   */
  boolean(): BooleanValidator;

  /**
   * Validate the literal value `null`.
   *
   * @returns A validator that only accepts `null`.
   */
  null(): NullValidator;

  /**
   * Accept any value without validation.
   *
   * Use this sparingly for escape hatches when you do not want Syncore to
   * enforce a more specific runtime shape.
   */
  any(): AnyValidator;

  /**
   * Validate a single literal value.
   *
   * @param literalValue - The exact value that must be provided.
   * @returns A validator that only accepts that one value.
   */
  literal<TValue extends string | number | boolean | null>(
    literalValue: TValue
  ): LiteralValidator<TValue>;

  /**
   * Validate an array whose items all use the same validator.
   *
   * @param itemValidator - The validator for each item in the array.
   * @returns A validator for arrays of the provided item type.
   */
  array<TItem>(itemValidator: Validator<TItem>): ArrayValidator<TItem>;

  /**
   * Validate an object with a fixed property shape.
   *
   * @param shape - The validators for each property on the object.
   * @returns A validator for objects matching that shape.
   */
  object<TShape extends ObjectValidatorShape>(
    shape: TShape
  ): ObjectValidator<TShape>;

  /**
   * Validate an identifier string that points at a table.
   *
   * Use this for document ids that come from Syncore tables.
   *
   * @param tableName - The name of the referenced table.
   * @returns A validator for ids belonging to that table.
   */
  id<TTableName extends string>(tableName: TTableName): IdValidator<TTableName>;

  /**
   * Make another validator optional.
   *
   * @param inner - The validator for the defined case.
   * @returns A validator that accepts `undefined` or the inner value.
   */
  optional<TValue>(inner: Validator<TValue>): OptionalValidator<TValue>;
}

function isValidator(
  value: Validator<unknown> | ValidatorMap
): value is Validator<unknown> {
  return typeof (value as Validator<unknown>).parse === "function";
}

export function ensureObjectValidator(
  value: Validator<unknown> | ValidatorMap
): Validator<unknown> {
  if (isValidator(value)) {
    return value;
  }
  return new ObjectValidator(value);
}

/**
 * Build runtime validators for schemas, function args, and return values.
 *
 * @example
 * ```ts
 * defineTable({
 *   text: v.string(),
 *   done: v.boolean(),
 *   ownerId: v.optional(v.id("users"))
 * });
 * ```
 */
export const v: ValidatorBuilderApi = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  boolean: () => new BooleanValidator(),
  null: () => new NullValidator(),
  any: () => new AnyValidator(),
  literal: <TValue extends string | number | boolean | null>(
    literalValue: TValue
  ) => new LiteralValidator(literalValue),
  array: <TItem>(itemValidator: Validator<TItem>) =>
    new ArrayValidator(itemValidator),
  object: <TShape extends ObjectValidatorShape>(shape: TShape) =>
    new ObjectValidator(shape),
  id: <TTableName extends string>(tableName: TTableName) =>
    new IdValidator(tableName),
  optional: <TValue>(inner: Validator<TValue>) => new OptionalValidator(inner)
};

export function describeValidator(
  validator: Validator<unknown>
): ValidatorDescription {
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
    case "array":
      return {
        kind: "array",
        item: describeValidator(
          (validator as ArrayValidator<unknown>).itemValidator
        )
      };
    case "object": {
      const objectValidator =
        validator as ObjectValidator<ObjectValidatorShape>;
      return {
        kind: "object",
        shape: Object.fromEntries(
          Object.entries(objectValidator.shape).map(([key, nested]) => [
            key,
            describeValidator(nested)
          ])
        )
      };
    }
    case "id":
      return {
        kind: "id",
        tableName: (validator as IdValidator<string>).tableName
      };
    case "optional":
      return {
        kind: "optional",
        inner: describeValidator(
          (validator as OptionalValidator<unknown>).inner
        )
      };
  }
}
