import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable.js";

describe("stableStringify", () => {
  it("sorts object keys deterministically", () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":1}'
    );
  });

  it("returns a string for top-level undefined-like values", () => {
    expect(stableStringify(undefined)).toBe("undefined");
    expect(stableStringify(() => undefined)).toBe("undefined");
    expect(stableStringify(Symbol("value"))).toBe("undefined");
  });

  it("rejects bigint values with a clear error", () => {
    expect(() => stableStringify({ value: 1n })).toThrow(
      "stableStringify does not support bigint values."
    );
  });

  it("rejects circular values with a clear error", () => {
    const value: { self?: unknown } = {};
    value.self = value;

    expect(() => stableStringify(value)).toThrow(
      "stableStringify does not support circular values."
    );
  });
});
