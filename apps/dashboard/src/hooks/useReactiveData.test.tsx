import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDidJustChange, useTrackChanges } from "./useReactiveData";

describe("useTrackChanges", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("increments the pulse for consecutive updates on the same row", async () => {
    const { result, rerender } = renderHook(
      ({ items }: { items: Array<{ _id: string; value: string }> }) =>
        useTrackChanges(items, (item) => item._id, (item) => item.value),
      {
        initialProps: {
          items: [{ _id: "row-1", value: "first" }]
        }
      }
    );

    expect(result.current.getNewPulse("row-1")).toBe(1);

    act(() => {
      rerender({
        items: [{ _id: "row-1", value: "second" }]
      });
    });

    expect(result.current.getChangePulse("row-1")).toBe(1);

    act(() => {
      rerender({
        items: [{ _id: "row-1", value: "third" }]
      });
    });

    expect(result.current.getChangePulse("row-1")).toBe(2);
  });
});

describe("useDidJustChange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-triggers its pulse for successive value changes", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => useDidJustChange(value),
      {
        initialProps: { value: 1 }
      }
    );

    expect(result.current.didChange).toBe(false);

    act(() => {
      rerender({ value: 2 });
    });

    expect(result.current.didChange).toBe(true);
    expect(result.current.pulse).toBe(1);

    act(() => {
      rerender({ value: 3 });
    });

    expect(result.current.didChange).toBe(true);
    expect(result.current.pulse).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    expect(result.current.didChange).toBe(false);
    expect(result.current.pulse).toBe(0);
  });
});
