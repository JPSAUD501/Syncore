import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { SyncoreDevtoolsEvent, SyncoreRuntimeSummary } from "@syncore/devtools-protocol";
import {
  useActiveRuntime,
  useBestConnectedRuntime,
  useConnectedRuntimes,
  useConnectedTargets,
  useDevtoolsStore,
  useSelectedRuntimeFilter,
  useSelectedTarget,
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
    events: SyncoreDevtoolsEvent[];
    summary: SyncoreRuntimeSummary;
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
    events:
      overrides.events ??
      [],
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

function buildSummary(
  runtimeId: string,
  recentEventCount: number
): SyncoreRuntimeSummary {
  return {
    runtimeId,
    platform: "browser",
    connectedAt: 1,
    activeQueryCount: 0,
    recentEventCount
  };
}

function resetStore() {
  useDevtoolsStore.setState((state) => ({
    ...state,
    connected: false,
    runtimes: {},
    selectedTargetId: null,
    selectedRuntimeId: null,
    selectedRuntimeFilter: null,
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
          events: [
            {
              type: "query.executed",
              runtimeId: "runtime-old",
              queryId: "query-1",
              functionName: "tasks:list",
              dependencies: [],
              durationMs: 1,
              timestamp: 1
            }
          ],
          summary: buildSummary("runtime-old", 5),
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

  it("defaults to the aggregated client target when multiple sessions share a target", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace"
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-b-87654321",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace"
    });

    const { result } = renderHook(() => ({
      targets: useConnectedTargets(),
      selectedTarget: useSelectedTarget(),
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime()
    }));

    expect(result.current.targets).toHaveLength(1);
    expect(result.current.targets[0]?.runtimeIds).toHaveLength(2);
    expect(result.current.selectedTarget?.kind).toBe("client");
    expect(result.current.runtimeFilter).toBe("all");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-a-12345678");
  });

  it("falls back to all sessions when the selected runtime filter disconnects", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace"
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-b-87654321",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace"
    });
    useDevtoolsStore.getState().selectRuntime("runtime-b-87654321");

    useDevtoolsStore.getState()._handleMessage({
      type: "event",
      event: {
        type: "runtime.disconnected",
        runtimeId: "runtime-b-87654321",
        timestamp: 10
      }
    });

    const { result } = renderHook(() => ({
      selectedTarget: useSelectedTarget(),
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime()
    }));

    expect(result.current.selectedTarget?.kind).toBe("client");
    expect(result.current.runtimeFilter).toBe("all");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-a-12345678");
  });

  it("keeps the last runtime snapshot when a runtime disconnects", () => {
    useDevtoolsStore.setState((state) => ({
      ...state,
      connected: true,
      selectedRuntimeId: "runtime-old",
      runtimes: {
        "runtime-old": buildRuntime("runtime-old", {
          connected: true,
          summary: buildSummary("runtime-old", 5),
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
    expect(runtime?.summary).toEqual(buildSummary("runtime-old", 5));
    expect(runtime?.activeQueries).toHaveLength(1);
    expect(runtime?.events[0]?.type).toBe("runtime.disconnected");
    expect(runtime?.events[1]?.type).toBe("mutation.committed");
  });
});
