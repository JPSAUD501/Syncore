import { describe, expect, it } from "vitest";
import { stableStringify } from "./stable.js";

describe("stableStringify", () => {
  it("sorts object keys recursively", () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe(
      '{"a":{"c":3,"d":4},"b":1}'
    );
  });

  it("returns a string for top-level undefined-like JSON values", () => {
    expect(stableStringify(undefined)).toBe("undefined");
    expect(stableStringify(() => undefined)).toBe("undefined");
    expect(stableStringify(Symbol("value"))).toBe("undefined");
  });

  it("rejects bigint values explicitly", () => {
    expect(() => stableStringify({ value: 1n })).toThrow(
      "stableStringify does not support bigint values."
    );
  });

  it("rejects circular values explicitly", () => {
    const value: { child?: unknown } = {};
    value.child = value;
    expect(() => stableStringify(value)).toThrow(
      "stableStringify does not support circular values."
    );
  });
});
