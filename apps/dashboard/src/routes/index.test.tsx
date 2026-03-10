import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SyncoreDevtoolsSubscriptionResultPayload,
  SyncoreRuntimeSummary
} from "@syncore/devtools-protocol";
import { OverviewPage } from "./index";

const storeState = {
  connected: true,
  connectedRuntimeCount: 1,
  includeDashboardActivity: false,
  activeRuntime: {
    runtimeId: "runtime-1",
    platform: "browser",
    connected: true,
    events: Array.from({ length: 8 }, (_, index) => ({
      type: "query.executed",
      runtimeId: "runtime-1",
      queryId: `query-${index + 1}`,
      functionName: "tasks:list",
      dependencies: [],
      durationMs: 1,
      timestamp: index + 1
    })),
    queryCount: 7,
    mutationCount: 3,
    actionCount: 2,
    errorCount: 1,
    activeQueries: [
      {
        id: "stale-query",
        functionName: "tasks:list",
        dependencyKeys: [],
        lastRunAt: 1
      }
    ],
    summary: buildSummary(8)
  } as {
    runtimeId: string;
    platform: string;
    connected: boolean;
    events: Array<{
      type: "query.executed";
      runtimeId: string;
      queryId: string;
      functionName: string;
      dependencies: string[];
      durationMs: number;
      timestamp: number;
    }>;
    queryCount: number;
    mutationCount: number;
    actionCount: number;
    errorCount: number;
    activeQueries: Array<{
      id: string;
      functionName: string;
      dependencyKeys: string[];
      lastRunAt: number;
    }>;
    summary: SyncoreRuntimeSummary | null;
  } | null,
  runtimeConnected: true,
  clearEvents: vi.fn()
};

type RuntimeSummaryResult = Extract<
  SyncoreDevtoolsSubscriptionResultPayload,
  { kind: "runtime.summary.result" }
>;
type RuntimeActiveQueriesResult = Extract<
  SyncoreDevtoolsSubscriptionResultPayload,
  { kind: "runtime.activeQueries.result" }
>;

const subscriptionState: {
  summary: {
    loading: boolean;
    data: RuntimeSummaryResult | null;
  };
  activeQueries: {
    loading: boolean;
    data: RuntimeActiveQueriesResult | null;
  };
} = {
  summary: {
    loading: false,
    data: {
      kind: "runtime.summary.result",
      summary: buildSummary(8)
    }
  },
  activeQueries: {
    loading: false,
    data: {
      kind: "runtime.activeQueries.result",
      activeQueries: [
        {
          id: "fresh-query",
          functionName: "tasks:list",
          dependencyKeys: [],
          lastRunAt: 1
        }
      ]
    }
  }
};

function buildSummary(recentEventCount: number): SyncoreRuntimeSummary {
  return {
    runtimeId: "runtime-1",
    platform: "browser",
    connectedAt: 1,
    activeQueryCount: 0,
    recentEventCount
  };
}

vi.mock("@/lib/store", () => ({
  useDevtoolsStore: (selector: (state: {
    connected: boolean;
    clearEvents: () => void;
    includeDashboardActivity: boolean;
  }) => unknown) =>
    selector({
      connected: storeState.connected,
      clearEvents: storeState.clearEvents,
      includeDashboardActivity: storeState.includeDashboardActivity
    }),
  useActiveRuntime: () => storeState.activeRuntime,
  useConnectedRuntimeCount: () => storeState.connectedRuntimeCount,
  useRuntimeList: () => (storeState.activeRuntime ? [storeState.activeRuntime] : []),
  getPublicRuntimeId: (runtimeId: string) => runtimeId.slice(0, 8),
  getRuntimeLabel: (runtime: {
    sessionLabel?: string;
    appName?: string;
    platform: string;
  }) => runtime.sessionLabel ?? runtime.appName ?? runtime.platform
}));

vi.mock("@/hooks", () => ({
  useConnection: () => ({ runtimeConnected: storeState.runtimeConnected }),
  useDevtools: () => ({
    events: storeState.activeRuntime?.events ?? [],
    queryCount: storeState.activeRuntime?.queryCount ?? 0,
    mutationCount: storeState.activeRuntime?.mutationCount ?? 0,
    actionCount: storeState.activeRuntime?.actionCount ?? 0,
    errorCount: storeState.activeRuntime?.errorCount ?? 0,
    includeDashboardActivity: storeState.includeDashboardActivity
  }),
  useDevtoolsSubscription: (payload: { kind: string } | null) => {
    if (!payload) {
      return { data: null, loading: false, error: null, hasData: false };
    }
    if (payload.kind === "runtime.summary") {
      return {
        ...subscriptionState.summary,
        error: null,
        hasData: subscriptionState.summary.data !== null
      };
    }
    if (payload.kind === "runtime.activeQueries") {
      return {
        ...subscriptionState.activeQueries,
        error: null,
        hasData: subscriptionState.activeQueries.data !== null
      };
    }
    return { data: null, loading: false, error: null, hasData: false };
  },
  useDidJustChange: () => ({ didChange: false, pulse: 0 }),
  useRefreshTimer: () => undefined
}));

function resetTestState() {
  storeState.connected = true;
  storeState.connectedRuntimeCount = 1;
  storeState.includeDashboardActivity = false;
  storeState.runtimeConnected = true;
  storeState.activeRuntime = {
    runtimeId: "runtime-1",
    platform: "browser",
    connected: true,
    events: Array.from({ length: 8 }, (_, index) => ({
      type: "query.executed",
      runtimeId: "runtime-1",
      queryId: `query-${index + 1}`,
      functionName: "tasks:list",
      dependencies: [],
      durationMs: 1,
      timestamp: index + 1
    })),
    queryCount: 7,
    mutationCount: 3,
    actionCount: 2,
    errorCount: 1,
    activeQueries: [
      {
        id: "stale-query",
        functionName: "tasks:list",
        dependencyKeys: [],
        lastRunAt: 1
      }
    ],
    summary: buildSummary(8)
  };
  subscriptionState.summary = {
    loading: false,
    data: {
      kind: "runtime.summary.result",
      summary: buildSummary(8)
    }
  };
  subscriptionState.activeQueries = {
    loading: false,
    data: {
      kind: "runtime.activeQueries.result",
      activeQueries: [
        {
          id: "fresh-query",
          functionName: "tasks:list",
          dependencyKeys: [],
          lastRunAt: 1
        }
      ]
    }
  };
  storeState.clearEvents.mockReset();
}

describe("OverviewPage", () => {
  afterEach(() => {
    resetTestState();
  });

  it("hides stale summary details while the selected runtime is inactive", () => {
    storeState.runtimeConnected = false;
    storeState.activeRuntime = {
      ...storeState.activeRuntime!,
      connected: false
    };

    render(<OverviewPage />);

    expect(screen.queryAllByText("Watching")).toHaveLength(0);
    expect(screen.getAllByText("Captured before disconnect").length).toBeGreaterThan(0);
  });

  it("shows loading placeholders while fresh runtime data is still pending", () => {
    subscriptionState.summary = { loading: true, data: null };
    subscriptionState.activeQueries = { loading: true, data: null };

    render(<OverviewPage />);

    expect(screen.getAllByText("...").length).toBeGreaterThan(0);
    expect(screen.getByText("Waiting for live query data.")).not.toBeNull();
  });

  it("renders fresh subscription data once it arrives", () => {
    render(<OverviewPage />);

    expect(screen.getAllByText("Watching").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 queries").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8 events").length).toBeGreaterThan(0);
  });
});
