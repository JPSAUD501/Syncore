import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncoreDevtoolsSubscriptionResultPayload } from "@syncore/devtools-protocol";
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
    summary: { recentEventCount: 8 }
  } as {
    runtimeId: string;
    platform: string;
    connected: boolean;
    events: Array<{ type: string; timestamp: number }>;
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
    summary: { recentEventCount: number } | null;
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
      summary: { recentEventCount: 8 }
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
  useConnectedRuntimeCount: () => storeState.connectedRuntimeCount
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
    summary: { recentEventCount: 8 }
  };
  subscriptionState.summary = {
    loading: false,
    data: {
      kind: "runtime.summary.result",
      summary: { recentEventCount: 8 }
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

    expect(screen.queryByText("Watching")).toBeNull();
    expect(screen.queryByText("7")).toBeNull();
    expect(screen.getAllByText("Waiting for runtime data").length).toBeGreaterThan(0);
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

    expect(screen.getByText("Watching")).not.toBeNull();
    expect(screen.getByText("1 queries")).not.toBeNull();
    expect(screen.getAllByText("8 events").length).toBeGreaterThan(0);
  });
});
