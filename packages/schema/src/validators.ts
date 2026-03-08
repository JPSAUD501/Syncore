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

export interface Validator<TValue> {
  readonly kind: ValidatorKind;
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

export class LiteralValidator<TValue extends string | number | boolean | null>
  implements Validator<TValue>
{
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

export class ObjectValidator<TShape extends ObjectValidatorShape>
  implements Validator<{ [TKey in keyof TShape]: Infer<TShape[TKey]> }>
{
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

export class IdValidator<TTableName extends string>
  implements Validator<string>
{
  readonly kind = "id" as const;

  constructor(public readonly tableName: TTableName) {}

  parse(value: unknown, path = "value"): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${path} must be a non-empty id string.`);
    }
    return value;
  }
}

export class OptionalValidator<TValue>
  implements Validator<TValue | undefined>
{
  readonly kind = "optional" as const;

  constructor(public readonly inner: Validator<TValue>) {}

  parse(value: unknown, path = "value"): TValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return this.inner.parse(value, path);
  }
}

export type Infer<TValidator> = TValidator extends Validator<infer TValue>
  ? TValue
  : never;

export type ValidatorMap = Record<string, Validator<unknown>>;

function isValidator(value: Validator<unknown> | ValidatorMap): value is Validator<unknown> {
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

export const v = {
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
        value: (validator as LiteralValidator<string | number | boolean | null>).literalValue
      };
    case "array":
      return {
        kind: "array",
        item: describeValidator((validator as ArrayValidator<unknown>).itemValidator)
      };
    case "object": {
      const objectValidator = validator as ObjectValidator<ObjectValidatorShape>;
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
        inner: describeValidator((validator as OptionalValidator<unknown>).inner)
      };
  }
}
