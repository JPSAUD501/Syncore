import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
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
  useSelectedTargetEvents,
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

  it("orders events by newest execution order even when a rerun has a causal parent", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-old",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageIdentity: "idb://workspace"
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "event.batch",
      runtimeId: "runtime-old",
      events: [
        {
          type: "query.executed",
          runtimeId: "runtime-old",
          queryId: "tasks/list",
          functionName: "tasks/list",
          executionId: "query-rerun",
          parentExecutionId: "mutation-1",
          dependencies: [],
          durationMs: 1,
          timestamp: 12
        },
        {
          type: "mutation.committed",
          runtimeId: "runtime-old",
          mutationId: "mutation-1",
          functionName: "tasks:update",
          executionId: "mutation-1",
          changedTables: ["tasks"],
          durationMs: 4,
          timestamp: 10
        }
      ]
    });

    const { result } = renderHook(() => useSelectedTargetEvents());

    expect(result.current.map((event) => event.type)).toEqual([
      "query.executed",
      "mutation.committed"
    ]);
  });

  it("orders selected target events by timestamp across runtimes", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-a",
        platform: "browser-worker",
        targetKind: "client",
        appName: "localhost",
        origin: "http://localhost:3000",
        storageIdentity: "idb://workspace"
      })
    );
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-b",
        platform: "browser-worker",
        targetKind: "client",
        appName: "localhost",
        origin: "http://localhost:3000",
        storageIdentity: "idb://workspace"
      })
    );

    useDevtoolsStore.getState()._handleMessage({
      type: "event.batch",
      runtimeId: "runtime-a",
      events: [
        {
          type: "query.executed",
          runtimeId: "runtime-a",
          queryId: "a-old",
          functionName: "tasks:list",
          dependencies: [],
          durationMs: 1,
          timestamp: 100,
          sequence: 200
        }
      ]
    });
    useDevtoolsStore.getState()._handleMessage({
      type: "event.batch",
      runtimeId: "runtime-b",
      events: [
        {
          type: "mutation.committed",
          runtimeId: "runtime-b",
          mutationId: "b-new",
          functionName: "tasks:update",
          changedTables: ["tasks"],
          durationMs: 3,
          timestamp: 200,
          sequence: 1
        }
      ]
    });

    const { result } = renderHook(() => useSelectedTargetEvents());

    expect(result.current.map((event) => event.runtimeId)).toEqual([
      "runtime-b",
      "runtime-a"
    ]);
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

  it("selects the only runtime directly when a client data source has one runtime", () => {
    useDevtoolsStore.getState()._handleMessage({
      type: "hello",
      runtimeId: "runtime-a-12345678",
      platform: "browser-worker",
      targetKind: "client",
      appName: "localhost",
      origin: "http://localhost:3000",
      storageProtocol: "opfs",
      storageIdentity: "opfs://workspace",
      dataSourceAlias: "Quick Sentinel",
      sessionLabel: "Solo Session (Chrome)"
    });

    const { result } = renderHook(() => ({
      targets: useConnectedTargets(),
      selectedTarget: useSelectedTarget(),
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime(),
      selectedRuntimeId: useDevtoolsStore((state) => state.selectedRuntimeId)
    }));

    expect(result.current.targets).toHaveLength(1);
    expect(result.current.targets[0]?.runtimeIds).toHaveLength(1);
    expect(result.current.selectedTarget?.kind).toBe("client");
    expect(result.current.selectedTarget?.label).toBe("Quick Sentinel");
    expect(result.current.selectedTarget?.technicalLabel).toContain(
      "localhost:3000"
    );
    expect(result.current.runtimeFilter).toBe("runtime-a-12345678");
    expect(result.current.activeRuntime?.runtimeId).toBe("runtime-a-12345678");
  });

  it("labels data sources without using the runtime session label", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-node",
        platform: "node",
        targetKind: "client",
        databaseLabel: "tasks.db",
        storageProtocol: "file",
        storageIdentity: "file://tasks.db",
        sessionLabel: "Random Runtime"
      })
    );

    const { result } = renderHook(() => useSelectedTarget());

    expect(result.current?.label).toBe("tasks.db");
    expect(result.current?.label).not.toContain("Random Runtime");
  });

  it("groups a project target with a client runtime that points to the same storage", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-electron",
        platform: "electron-main",
        targetKind: "client",
        databaseLabel: "syncore.db",
        storageProtocol: "file",
        storageIdentity: "file::/tmp/syncore.db",
        sessionLabel: "Electric Fox (Electron)"
      })
    );
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "syncore-project-target",
        platform: "project",
        targetKind: "project",
        runtimeRole: "project-target",
        databaseLabel: "syncore.db",
        storageProtocol: "file",
        storageIdentity: "file::/tmp/syncore.db"
      })
    );

    const { result } = renderHook(() => ({
      targets: useConnectedTargets(),
      selectedTarget: useSelectedTarget(),
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime(),
      targetRuntimes: useSelectedTargetRuntimes()
    }));

    expect(result.current.targets).toHaveLength(1);
    expect(result.current.selectedTarget?.kind).toBe("client");
    expect(result.current.selectedTarget?.label).toBe("syncore.db");
    expect(result.current.selectedTarget?.runtimeIds).toEqual([
      "runtime-electron",
      "syncore-project-target"
    ]);
    expect(result.current.runtimeFilter).toBe("all");
    expect(result.current.activeRuntime?.runtimeId).toBe(
      "syncore-project-target"
    );
    expect(
      result.current.targetRuntimes.some(
        (runtime) => runtime.runtimeId === "syncore-project-target"
      )
    ).toBe(true);

    act(() => {
      useDevtoolsStore.getState().selectRuntime("syncore-project-target");
    });
    expect(result.current.runtimeFilter).toBe("syncore-project-target");
    expect(result.current.activeRuntime?.runtimeId).toBe(
      "syncore-project-target"
    );
    expect(result.current.activeRuntime?.runtimeRole).toBe("project-target");

    act(() => {
      useDevtoolsStore.getState()._handleMessage({
        type: "event",
        event: {
          type: "log",
          runtimeId: "runtime-electron",
          level: "info",
          message: "app runtime event",
          timestamp: 10
        }
      });
    });

    expect(result.current.runtimeFilter).toBe("syncore-project-target");
    expect(result.current.activeRuntime?.runtimeId).toBe(
      "syncore-project-target"
    );
  });

  it("uses the project target as the default executor when all runtimes is selected", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-electron",
        platform: "electron-main",
        targetKind: "client",
        databaseLabel: "syncore.db",
        storageProtocol: "file",
        storageIdentity: "file::/tmp/syncore.db",
        sessionLabel: "electron-main"
      })
    );
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "syncore-project-target",
        platform: "project",
        targetKind: "project",
        runtimeRole: "project-target",
        databaseLabel: "syncore.db",
        storageProtocol: "file",
        storageIdentity: "file::/tmp/syncore.db",
        sessionLabel: "Project target"
      })
    );

    act(() => {
      useDevtoolsStore.getState().selectRuntimeFilter("all");
    });

    const { result } = renderHook(() => ({
      runtimeFilter: useSelectedRuntimeFilter(),
      activeRuntime: useActiveRuntime(),
      selectedRuntimeId: useDevtoolsStore((state) => state.selectedRuntimeId)
    }));

    expect(result.current.runtimeFilter).toBe("all");
    expect(result.current.selectedRuntimeId).toBe("syncore-project-target");
    expect(result.current.activeRuntime?.runtimeRole).toBe("project-target");
  });

  it("uses the public target id as the visible fallback when metadata is missing", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-incomplete",
        platform: "browser-worker",
        targetKind: "client",
        sessionLabel: "Visible Runtime"
      })
    );

    const { result } = renderHook(() => useSelectedTarget());

    expect(result.current?.label).toMatch(/^Data source T\d{5}$/);
    expect(result.current?.metadataIncomplete).toBe(true);
    expect(result.current?.metadataWarning).toBe(
      "Runtime did not provide storage metadata."
    );
  });

  it("normalizes idb storage metadata as IndexedDB", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-idb",
        platform: "browser-worker",
        targetKind: "client",
        origin: "http://localhost:3000",
        storageProtocol: "idb",
        storageIdentity: "idb://workspace",
        databaseLabel: "syncore",
        dataSourceAlias: "Vivid Dragon"
      })
    );

    const { result } = renderHook(() => useSelectedTarget());

    expect(result.current?.label).toBe("Vivid Dragon");
    expect(result.current?.storageProtocol).toBe("indexeddb");
    expect(result.current?.technicalLabel).toContain("localhost:3000");
  });

  it("derives SQL support from announced capabilities", () => {
    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-web",
        platform: "browser-worker",
        targetKind: "client",
        origin: "http://localhost:3000",
        storageProtocol: "opfs",
        storageIdentity: "opfs://workspace",
        capabilities: {
          sql: {
            read: false,
            write: false,
            live: false,
            reason: "SQL Console is not available for browser runtimes."
          }
        }
      })
    );

    const { result } = renderHook(() => ({
      selectedTarget: useSelectedTarget(),
      targets: useConnectedTargets()
    }));
    expect(result.current.selectedTarget?.sqlAvailable).toBe(false);
    expect(result.current.selectedTarget?.sqlUnavailableReason).toBe(
      "SQL Console is not available for browser runtimes."
    );

    useDevtoolsStore.getState()._handleMessage(
      helloMessage({
        runtimeId: "runtime-node",
        platform: "browser-worker",
        targetKind: "client",
        databaseLabel: "app.db",
        storageProtocol: "file",
        storageIdentity: "file://app.db",
        capabilities: {
          sql: {
            read: true,
            write: true,
            live: true
          }
        }
      })
    );
    const { result: targetsAfterFileRuntime } = renderHook(() =>
      useConnectedTargets()
    );
    const fileTarget = targetsAfterFileRuntime.current.find(
      (target) => target.label === "app.db"
    );
    expect(fileTarget).toBeDefined();
    useDevtoolsStore.getState().selectTarget(fileTarget?.id ?? null);

    const { result: selectedFileTarget } = renderHook(() =>
      useSelectedTarget()
    );
    expect(selectedFileTarget.current?.sqlAvailable).toBe(true);
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

  it("defaults to all sessions while keeping a deterministic executor when a second session joins the same client target", () => {
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
      activeRuntime: useActiveRuntime(),
      selectedRuntimeId: useDevtoolsStore((state) => state.selectedRuntimeId)
    }));

    expect(result.current.targets).toHaveLength(1);
    expect(result.current.targets[0]?.runtimeIds).toHaveLength(2);
    expect(result.current.selectedTarget?.kind).toBe("client");
    expect(result.current.runtimeFilter).toBe("all");
    expect(result.current.selectedRuntimeId).toBe("runtime-a-12345678");
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
    expect(result.current.selectedTarget?.connectedRuntimes).toBe(1);
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
