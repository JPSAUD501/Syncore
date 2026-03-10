import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { SyncoreDevtoolsEvent, SyncoreRuntimeSummary } from "@syncore/devtools-protocol";
import {
  useActiveRuntime,
  useBestConnectedRuntime,
  useConnectedRuntimes,
  useDevtoolsStore,
  useSelectedRuntimeConnected
} from "./store";
import { useConnection } from "@/hooks/useConnection";

interface TestRuntimeState {
  runtimeId: string;
  platform: string;
  sessionLabel?: string;
  connected: boolean;
  events: SyncoreDevtoolsEvent[];
  summary: SyncoreRuntimeSummary | null;
  activeQueries: Array<{
    id: string;
    functionName: string;
    dependencyKeys: string[];
    lastRunAt: number;
  }>;
  queryCount: number;
  mutationCount: number;
  actionCount: number;
  errorCount: number;
  liveQueryVersion: number;
  lastSubscriptionError: string | null;
}

function buildRuntime(
  runtimeId: string,
  overrides: Partial<{
    connected: boolean;
    platform: string;
    sessionLabel: string;
    events: Array<{
      type: string;
      timestamp: number;
      runtimeId?: string;
      [key: string]: unknown;
    }>;
    summary: { recentEventCount: number };
    activeQueries: Array<{
      id: string;
      functionName: string;
      dependencyKeys: string[];
      lastRunAt: number;
    }>;
    queryCount: number;
  }> = {}
): TestRuntimeState {
  return {
    runtimeId,
    platform: overrides.platform ?? "browser",
    ...(overrides.sessionLabel
      ? { sessionLabel: overrides.sessionLabel }
      : {}),
    connected: overrides.connected ?? true,
    events: overrides.events ?? [],
    summary: (overrides.summary as never) ?? null,
    activeQueries: (overrides.activeQueries as never) ?? [],
    queryCount: overrides.queryCount ?? 0,
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
    selectedRuntimeId: null,
    includeDashboardActivity: false
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

  it("clears volatile runtime data when the hub disconnects", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: true,
          events: [{ type: "query.executed", timestamp: 1 }],
          summary: { recentEventCount: 5 },
          activeQueries: [
            {
              id: "query-1",
              functionName: "tasks:list",
              dependencyKeys: [],
              lastRunAt: 1
            }
          ],
          queryCount: 5
        })
      }
    }));

    useDevtoolsStore.getState()._markAllRuntimesDisconnected();

    const runtime = useDevtoolsStore.getState().runtimes["runtime-old"];
    expect(runtime?.connected).toBe(false);
    expect(runtime?.events).toEqual([]);
    expect(runtime?.summary).toBeNull();
    expect(runtime?.activeQueries).toEqual([]);
    expect(runtime?.queryCount).toBe(0);
  });

  it("applies replayed event history in a single batch", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: true
        })
      }
    }));

    useDevtoolsStore.getState()._handleMessage({
      type: "event.batch",
      runtimeId: "runtime-old",
      events: [
        {
          type: "mutation.committed",
          runtimeId: "runtime-old",
          mutationId: "mutation-1",
          functionName: "tasks:create",
          changedTables: ["tasks"],
          durationMs: 4,
          timestamp: 2
        },
        {
          type: "query.executed",
          runtimeId: "runtime-old",
          queryId: "query-1",
          functionName: "tasks:list",
          dependencies: [],
          durationMs: 2,
          timestamp: 1
        }
      ]
    });

    const runtime = useDevtoolsStore.getState().runtimes["runtime-old"];
    expect(runtime?.events).toHaveLength(2);
    expect(runtime?.events[0]?.type).toBe("mutation.committed");
    expect(runtime?.events[1]?.type).toBe("query.executed");
    expect(runtime?.mutationCount).toBe(1);
    expect(runtime?.queryCount).toBe(1);
  });

  it("ignores duplicate live events for the same runtime", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: true
        })
      }
    }));

    const event = {
      type: "mutation.committed" as const,
      runtimeId: "runtime-old",
      mutationId: "mutation-1",
      functionName: "tasks:update",
      changedTables: ["tasks"],
      durationMs: 4,
      timestamp: 2
    };

    useDevtoolsStore.getState()._handleMessage({
      type: "event",
      event
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "event",
      event
    });

    const runtime = useDevtoolsStore.getState().runtimes["runtime-old"];
    expect(runtime?.events).toHaveLength(1);
    expect(runtime?.mutationCount).toBe(1);
  });

  it("keeps the last runtime snapshot when a runtime disconnects", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: true,
          summary: { recentEventCount: 5 },
          activeQueries: [
            {
              id: "query-1",
              functionName: "tasks:list",
              dependencyKeys: [],
              lastRunAt: 1
            }
          ],
          events: [
            {
              type: "mutation.committed",
              runtimeId: "runtime-old",
              mutationId: "mutation-1",
              functionName: "tasks:update",
              changedTables: ["tasks"],
              durationMs: 4,
              timestamp: 2
            }
          ]
        })
      }
    }));

    useDevtoolsStore.getState()._handleMessage({
      type: "event",
      event: {
        type: "runtime.disconnected",
        runtimeId: "runtime-old",
        timestamp: 3
      }
    });

    const runtime = useDevtoolsStore.getState().runtimes["runtime-old"];
    expect(runtime?.connected).toBe(false);
    expect(runtime?.summary).toEqual({ recentEventCount: 5 });
    expect(runtime?.activeQueries).toHaveLength(1);
    expect(runtime?.events[0]?.type).toBe("runtime.disconnected");
    expect(runtime?.events[1]?.type).toBe("mutation.committed");
  });
});
