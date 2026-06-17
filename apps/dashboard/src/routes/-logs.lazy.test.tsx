import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogsPage } from "./logs.lazy";

const storeState = {
  includeDashboardActivity: false,
  events: [
    {
      type: "query.executed" as const,
      runtimeId: "runtime-1",
      executionId: "1234567890abcdef",
      queryId: "1234567890abcdef",
      functionName: "auth/signIn",
      dependencies: [],
      durationMs: 12,
      timestamp: 1
    },
    {
      type: "query.invalidated" as const,
      runtimeId: "runtime-1",
      queryId: "1234567890abcdef:stale",
      reason: "stale",
      rerunExecutionId: "abcdef1234567890",
      timestamp: 2
    },
    {
      type: "query.executed" as const,
      runtimeId: "runtime-1",
      executionId: "abcdef1234567890",
      queryId: "1234567890abcdef",
      functionName: "auth/signIn",
      dependencies: [],
      durationMs: 8,
      timestamp: 3
    }
  ],
  runtimes: [
    {
      runtimeId: "runtime-1",
      platform: "browser-worker",
      sessionLabel: "Orbital Maverick"
    }
  ]
};

vi.mock("@tanstack/react-router", () => ({
  createLazyFileRoute: () => ({ component }: { component: unknown }) => component,
  useNavigate: () => vi.fn(),
  useSearch: () => ({})
}));

vi.mock("@/lib/store", () => ({
  useDevtoolsStore: (selector: (state: { includeDashboardActivity: boolean }) => unknown) =>
    selector({ includeDashboardActivity: storeState.includeDashboardActivity }),
  useRuntimeList: () => storeState.runtimes,
  sendRequest: vi.fn(),
  getRuntimeLabel: (runtime: { sessionLabel?: string; appName?: string; platform: string }) =>
    runtime.sessionLabel ?? runtime.appName ?? runtime.platform,
  getEventDedupKey: (event: { type: string; runtimeId: string; timestamp: number }) =>
    `${event.type}:${event.runtimeId}:${event.timestamp}`
}));

vi.mock("@/hooks", () => ({
  useDevtools: () => ({
    events: storeState.events,
    traceIndex: {
      traces: [],
      byExecutionId: new Map(),
      byQueryId: new Map(),
      byFunctionName: new Map(),
      byDocument: new Map(),
      invalidationsByCause: new Map()
    }
  }),
  useTrackChanges: () => ({
    isNew: () => false,
    isChanged: () => false,
    getChangePulse: () => 0,
    getNewPulse: () => 0
  }),
  usePreferredTarget: () => ({ targetRuntimeId: "runtime-1" })
}));

function resetState() {
  storeState.includeDashboardActivity = false;
  storeState.events = [
    {
      type: "query.executed",
      runtimeId: "runtime-1",
      executionId: "1234567890abcdef",
      queryId: "1234567890abcdef",
      functionName: "auth/signIn",
      dependencies: [],
      durationMs: 12,
      timestamp: 1
    },
    {
      type: "query.invalidated",
      runtimeId: "runtime-1",
      queryId: "1234567890abcdef:stale",
      reason: "stale",
      rerunExecutionId: "abcdef1234567890",
      timestamp: 2
    },
    {
      type: "query.executed",
      runtimeId: "runtime-1",
      executionId: "abcdef1234567890",
      queryId: "1234567890abcdef",
      functionName: "auth/signIn",
      dependencies: [],
      durationMs: 8,
      timestamp: 3
    }
  ];
}

describe("LogsPage", () => {
  afterEach(() => {
    resetState();
  });

  it("shows simplified runtime tags and normalized summaries", () => {
    render(<LogsPage />);

    expect(screen.getByText("auth:signIn · 12345678")).toBeTruthy();
    expect(screen.getByText("Rerun")).toBeTruthy();
    expect(screen.queryByText("12345678 · stale")).toBeNull();
    expect(screen.getAllByText("Orbital Maverick").length).toBeGreaterThan(0);
    expect(screen.queryByText(/K123/)).toBeNull();
  });

  it("does not mark the first query run as invalidated", () => {
    render(<LogsPage />);

    const rows = screen.getAllByRole("button", {
      name: /auth:signIn · (12345678|abcdef12)/
    });

    expect(rows[0]?.textContent).not.toContain("Rerun");
    expect(rows[1]?.textContent).toContain("Rerun");
  });

  it("shows shortened ids in the detail panel", () => {
    render(<LogsPage />);

    fireEvent.click(screen.getAllByText("auth:signIn · 12345678")[0]!);

    expect(screen.getByText("Query ID")).toBeTruthy();
    expect(screen.getAllByText("12345678").length).toBeGreaterThan(0);
    expect(screen.queryByText("1234567890abcdef")).toBeNull();
  });
});
