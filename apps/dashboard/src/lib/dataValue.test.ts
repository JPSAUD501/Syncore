import { describe, expect, it } from "vitest";
import {
  formatCellPreview,
  inferDateValue,
  parseEditableCellValue,
  toEditableCellText
} from "./dataValue";

describe("dataValue", () => {
  it("formats timestamp-like fields as iso strings", () => {
    const createdAt = 1_710_000_000_000;

    expect(inferDateValue("createdAt", createdAt)?.iso).toBe(
      "2024-03-09T16:00:00.000Z"
    );
    expect(toEditableCellText("updated_at", createdAt)).toBe(
      "2024-03-09T16:00:00.000Z"
    );
    expect(formatCellPreview("updatedAt", createdAt).kind).toBe("date");
  });

  it("parses edited iso values back into timestamps for numeric date fields", () => {
    const nextValue = parseEditableCellValue(
      "createdAt",
      "2024-03-09T16:30:00.000Z",
      1_710_000_000_000
    );

    expect(nextValue).toBe(1_710_001_800_000);
  });

  it("preserves strings for non-date fields", () => {
    expect(parseEditableCellValue("title", "Hello world", "before")).toBe(
      "Hello world"
    );
  });
});
