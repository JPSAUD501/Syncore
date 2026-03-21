import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LogsPage } from "./logs.lazy";

const storeState = {
  includeDashboardActivity: false,
  events: [
    {
      type: "query.executed" as const,
      runtimeId: "runtime-1",
      queryId: "1234567890abcdef",
      functionName: "auth/signIn",
      dependencies: [],
      durationMs: 12,
      timestamp: 1
    },
    {
      type: "query.invalidated" as const,
      runtimeId: "runtime-1",
      queryId: "8765432100000000:stale",
      reason: "stale",
      timestamp: 2
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
  createLazyFileRoute: () => ({ component }: { component: unknown }) => component
}));

vi.mock("@/lib/store", () => ({
  useDevtoolsStore: (selector: (state: { includeDashboardActivity: boolean }) => unknown) =>
    selector({ includeDashboardActivity: storeState.includeDashboardActivity }),
  useRuntimeList: () => storeState.runtimes,
  getRuntimeLabel: (runtime: { sessionLabel?: string; appName?: string; platform: string }) =>
    runtime.sessionLabel ?? runtime.appName ?? runtime.platform
}));

vi.mock("@/hooks", () => ({
  useDevtools: () => ({
    events: storeState.events
  })
}));

function resetState() {
  storeState.includeDashboardActivity = false;
  storeState.events = [
    {
      type: "query.executed",
      runtimeId: "runtime-1",
      queryId: "1234567890abcdef",
      functionName: "auth/signIn",
      dependencies: [],
      durationMs: 12,
      timestamp: 1
    },
    {
      type: "query.invalidated",
      runtimeId: "runtime-1",
      queryId: "8765432100000000:stale",
      reason: "stale",
      timestamp: 2
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
    expect(screen.getByText("87654321 · stale")).toBeTruthy();
    expect(screen.getAllByText("Orbital Maverick").length).toBeGreaterThan(0);
    expect(screen.queryByText(/K123/)).toBeNull();
  });

  it("shows shortened ids in the detail panel", () => {
    render(<LogsPage />);

    fireEvent.click(screen.getAllByText("auth:signIn · 12345678")[0]!);

    expect(screen.getByText("Query ID")).toBeTruthy();
    expect(screen.getByText("12345678")).toBeTruthy();
    expect(screen.queryByText("1234567890abcdef")).toBeNull();
  });
});
