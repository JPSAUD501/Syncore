export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(sortValue(value)) ?? "undefined";
}

export function sortValue(value: unknown): unknown {
  return sortValueInternal(value, new WeakSet<object>());
}

function sortValueInternal(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "bigint") {
    throw new TypeError("stableStringify does not support bigint values.");
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError("stableStringify does not support circular values.");
    }
    seen.add(value);
    try {
      return value.map((item) => sortValueInternal(item, seen));
    } finally {
      seen.delete(value);
    }
  }
  if (value && typeof value === "object") {
    if (value instanceof Date) {
      return value;
    }
    if (seen.has(value)) {
      throw new TypeError("stableStringify does not support circular values.");
    }
    seen.add(value);
    try {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, sortValueInternal(nested, seen)])
      );
    } finally {
      seen.delete(value);
    }
  }
  return value;
}
