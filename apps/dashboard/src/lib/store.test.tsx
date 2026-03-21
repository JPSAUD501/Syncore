import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
  SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
  type SyncoreDevtoolsEvent,
  type SyncoreDevtoolsMessage,
  type SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import {
  useActiveRuntime,
  useBestConnectedRuntime,
  useConnectedRuntimes,
  useConnectedTargets,
  useDevtoolsStore,
  useSelectedRuntimeFilter,
  useSelectedTarget,
  useSelectedTargetRuntimes,
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

function helloMessage(
  overrides: Partial<Extract<SyncoreDevtoolsMessage, { type: "hello" }>> & {
    runtimeId: string;
    platform: string;
  }
): Extract<SyncoreDevtoolsMessage, { type: "hello" }> {
  return {
    type: "hello",
    protocolVersion: SYNCORE_DEVTOOLS_PROTOCOL_VERSION,
    minSupportedProtocolVersion:
      SYNCORE_DEVTOOLS_MIN_SUPPORTED_PROTOCOL_VERSION,
    maxSupportedProtocolVersion:
      SYNCORE_DEVTOOLS_MAX_SUPPORTED_PROTOCOL_VERSION,
    ...overrides
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
    selectedRuntimeSelectionMode: null,
    includeDashboardActivity: false,
    hubToken: "testtoken",
    authRequired: false,
    authError: null
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

  it("selects the only session directly when a client target has a single session", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      sessionLabel: "Solo Session (Chrome)"
    });

    const { result } = renderHook(() => ({
      targets: useConnectedTargets(),
      selectedTarget: useSelectedTarget(),
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime()
    }));

    expect(result.current.targets).toHaveLength(1);
    expect(result.current.targets[0]?.runtimeIds).toHaveLength(1);
    expect(result.current.selectedTarget?.kind).toBe("client");
    expect(result.current.selectedTarget?.label).toBe("Solo Session (Chrome)");
    expect(result.current.runtimeFilter).toBe("runtime-a-12345678");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-a-12345678");
  });

  it("marks runtimes with incompatible devtools protocol as disconnected", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-incompatible",
        platform: "browser-worker",
        targetKind: "client",
        protocolVersion: 99,
        minSupportedProtocolVersion: 99,
        maxSupportedProtocolVersion: 99
      })
    );

    const runtime =
      useDevtoolsStore.getState().runtimes["runtime-incompatible"];

    expect(runtime?.connected).toBe(false);
    expect(runtime?.lastSubscriptionError).toContain(
      "uses devtools protocol 99"
    );
  });

  it("defaults to all sessions when a second session joins the same client target", () => {
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

  it("falls back to the only remaining session when the selected runtime disconnects", () => {
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
    expect(result.current.runtimeFilter).toBe("runtime-a-12345678");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-a-12345678");
  });

  it("keeps the selected session filter when other sessions emit events", () => {
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
        type: "query.executed",
        runtimeId: "runtime-a-12345678",
        queryId: "query-1",
        functionName: "tasks:list",
        dependencies: [],
        durationMs: 2,
        timestamp: 10
      }
    });

    const { result } = renderHook(() => ({
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime()
    }));

    expect(result.current.runtimeFilter).toBe("runtime-b-87654321");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-b-87654321");
  });

  it("keeps an explicitly selected session when a third session joins the same target", () => {
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
      type: "hello",
      runtimeId: "runtime-c-11223344",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace"
    });

    const { result } = renderHook(() => ({
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime(),
      runtimes: useSelectedTargetRuntimes()
    }));

    expect(result.current.runtimeFilter).toBe("runtime-b-87654321");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-b-87654321");
    expect(result.current.runtimes.map((runtime) => runtime.runtimeId)).toEqual([
      "runtime-a-12345678",
      "runtime-b-87654321",
      "runtime-c-11223344"
    ]);
  });

  it("does not expose disconnected sessions in the selected target runtime list", () => {
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
    useDevtoolsStore.getState()._handleMessage({
      type: "event",
      event: {
        type: "runtime.disconnected",
        runtimeId: "runtime-b-87654321",
        timestamp: 10
      }
    });

    const { result } = renderHook(() => ({
      targets: useConnectedTargets(),
      selectedTarget: useSelectedTarget(),
      runtimes: useSelectedTargetRuntimes()
    }));

    expect(result.current.targets).toHaveLength(1);
    expect(result.current.selectedTarget?.connectedSessions).toBe(1);
    expect(result.current.runtimes.map((runtime) => runtime.runtimeId)).toEqual([
      "runtime-a-12345678"
    ]);
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

  it("requests a token again when the dashboard auth state is reset", () => {
    useDevtoolsStore.getState().requestHubToken("Token missing");

    const state = useDevtoolsStore.getState();
    expect(state.hubToken).toBeNull();
    expect(state.authRequired).toBe(true);
    expect(state.authError).toBe("Token missing");
  });

  it("accepts a sanitized token from the auth modal", () => {
    useDevtoolsStore.getState().setHubToken(" token-123 ");

    const state = useDevtoolsStore.getState();
    expect(state.hubToken).toBe("token123");
    expect(state.authRequired).toBe(false);
    expect(state.authError).toBeNull();
  });
});
