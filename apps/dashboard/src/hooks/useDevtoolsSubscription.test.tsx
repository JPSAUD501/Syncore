import React from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncoreDevtoolsSubscriptionResultPayload } from "@syncore/devtools-protocol";
import { useDevtoolsSubscription } from "./useReactiveData";

type SubscriptionListener = (payload: unknown) => void;
type RuntimeSummaryResult = Extract<
  SyncoreDevtoolsSubscriptionResultPayload,
  { kind: "runtime.summary.result" }
>;
type RuntimeActiveQueriesResult = Extract<
  SyncoreDevtoolsSubscriptionResultPayload,
  { kind: "runtime.activeQueries.result" }
>;

const storeState = {
  selectedRuntimeId: "runtime-a"
};
const storeListeners = new Set<() => void>();
const subscriptions: Array<{ listener: SubscriptionListener }> = [];

function emitStoreUpdate() {
  for (const listener of storeListeners) {
    listener();
  }
}

vi.mock("@/lib/store", () => ({
  subscribe: (_payload: unknown, listener: SubscriptionListener) => {
    const record = { listener };
    subscriptions.push(record);
    return () => {
      const index = subscriptions.indexOf(record);
      if (index >= 0) {
        subscriptions.splice(index, 1);
      }
    };
  },
  useActiveRuntime: () => null,
  useDevtoolsStore: (selector: (state: typeof storeState) => unknown) =>
    React.useSyncExternalStore(
      (listener) => {
        storeListeners.add(listener);
        return () => storeListeners.delete(listener);
      },
      () => selector(storeState),
      () => selector(storeState)
    )
}));

function emitSubscriptionData(payload: unknown) {
  const current = subscriptions.at(-1);
  if (!current) {
    throw new Error("No subscription is active");
  }
  current.listener(payload);
}

function setSelectedRuntimeId(runtimeId: string) {
  storeState.selectedRuntimeId = runtimeId;
  emitStoreUpdate();
}

function resetMocks() {
  storeState.selectedRuntimeId = "runtime-a";
  subscriptions.splice(0, subscriptions.length);
  storeListeners.clear();
}

describe("useDevtoolsSubscription", () => {
  afterEach(() => {
    resetMocks();
  });

  it("resets prior payload immediately when the selected runtime changes", () => {
    const { result } = renderHook(() =>
      useDevtoolsSubscription<RuntimeSummaryResult>(
        { kind: "runtime.summary" },
        { enabled: true }
      )
    );

    expect(result.current.loading).toBe(true);

    act(() => {
      emitSubscriptionData({
        kind: "runtime.summary.result",
        summary: { recentEventCount: 5 }
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasData).toBe(true);

    act(() => {
      setSelectedRuntimeId("runtime-b");
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.hasData).toBe(false);
  });

  it("resets prior payload when reconnect toggles the subscription back on", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useDevtoolsSubscription<RuntimeSummaryResult>(
          { kind: "runtime.summary" },
          { enabled }
        ),
      {
        initialProps: { enabled: true }
      }
    );

    act(() => {
      emitSubscriptionData({
        kind: "runtime.summary.result",
        summary: { recentEventCount: 3 }
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasData).toBe(true);

    act(() => {
      rerender({ enabled: false });
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);

    act(() => {
      rerender({ enabled: true });
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.hasData).toBe(false);
  });

  it("publishes fresh data only after the first payload for the current runtime", () => {
    const { result } = renderHook(() =>
      useDevtoolsSubscription<RuntimeActiveQueriesResult>(
        { kind: "runtime.activeQueries" },
        { enabled: true }
      )
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.hasData).toBe(false);

    act(() => {
      emitSubscriptionData({
        kind: "runtime.activeQueries.result",
        activeQueries: [{ id: "query-1" }]
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.hasData).toBe(true);
    expect(result.current.data).toEqual({
      kind: "runtime.activeQueries.result",
      activeQueries: [{ id: "query-1" }]
    });
  });
});
