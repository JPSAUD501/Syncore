import { describe, expect, it } from "vitest";
import { createDevtoolsPreview } from "./shared.js";

describe("createDevtoolsPreview", () => {
  it("truncates circular and oversized values deterministically", () => {
    const value: { name: string; self?: unknown; items: number[] } = {
      name: "x".repeat(5000),
      items: Array.from({ length: 60 }, (_, index) => index)
    };
    value.self = value;

    const preview = createDevtoolsPreview(value);

    expect(preview.kind).toBe("value");
    expect(preview.truncated).toBe(true);
    if (preview.kind !== "value") {
      return;
    }
    expect(preview.value).toMatchObject({
      self: "[circular]"
    });
    expect((preview.value as { items: unknown[] }).items).toHaveLength(51);
  });
});
