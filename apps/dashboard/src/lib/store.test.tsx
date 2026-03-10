import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useActiveRuntime,
  useBestConnectedRuntime,
  useConnectedRuntimes,
  useDevtoolsStore,
  useSelectedRuntimeConnected
} from "./store";
import { useConnection } from "@/hooks/useConnection";

function buildRuntime(
  runtimeId: string,
  overrides: Partial<{
    connected: boolean;
    platform: string;
    sessionLabel: string;
  }> = {}
) {
  return {
    runtimeId,
    platform: overrides.platform ?? "browser",
    ...(overrides.sessionLabel
      ? { sessionLabel: overrides.sessionLabel }
      : {}),
    connected: overrides.connected ?? true,
    events: [],
    summary: null,
    activeQueries: [],
    queryCount: 0,
    mutationCount: 0,
    actionCount: 0,
    errorCount: 0,
    liveQueryVersion: 0,
    lastSubscriptionError: null
  };
}

function resetStore() {
  useDevtoolsStore.setState((state) => ({
    ...state,
    connected: false,
    runtimes: {},
    selectedRuntimeId: null
  }));
}

describe("devtools store runtime selection", () => {
  afterEach(() => {
    resetStore();
  });

  it("keeps an inactive runtime selected while hiding it from connected lists", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: false,
          sessionLabel: "Old Browser"
        }),
        "runtime-new": buildRuntime("runtime-new", {
          connected: true,
          sessionLabel: "New Browser"
        })
      }
    }));

    const { result } = renderHook(() => ({
      activeRuntime: useActiveRuntime(),
      connectedRuntimes: useConnectedRuntimes(),
      bestConnectedRuntime: useBestConnectedRuntime(),
      runtimeConnected: useSelectedRuntimeConnected()
    }));

    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-old");
    expect(result.current.runtimeConnected).toBe(false);
    expect(result.current.connectedRuntimes.map((runtime) => runtime.runtimeId)).toEqual([
      "runtime-new"
    ]);
    expect(result.current.bestConnectedRuntime?.runtimeId).toBe("runtime-new");
  });

  it("reports hub and runtime connectivity separately in useConnection", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: false
        }),
        "runtime-new": buildRuntime("runtime-new", {
          connected: true
        })
      }
    }));

    const { result } = renderHook(() => useConnection());

    expect(result.current.connected).toBe(true);
    expect(result.current.runtimeConnected).toBe(false);
    expect(result.current.isReady).toBe(false);
    expect(result.current.runtimeCount).toBe(1);
  });
});
