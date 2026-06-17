export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function normalizeSqliteParams(
  values: unknown[]
): Array<string | number | Uint8Array | null> {
  return values.map((value) => {
    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }
    if (
      value === null ||
      typeof value === "number" ||
      typeof value === "string" ||
      value instanceof Uint8Array
    ) {
      return value;
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    return JSON.stringify(value) ?? "undefined";
  });
}
