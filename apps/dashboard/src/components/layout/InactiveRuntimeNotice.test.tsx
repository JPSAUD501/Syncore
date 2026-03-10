import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { InactiveRuntimeNotice } from "./InactiveRuntimeNotice";
import { useDevtoolsStore } from "@/lib/store";

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

describe("InactiveRuntimeNotice", () => {
  afterEach(() => {
    resetStore();
  });

  it("shows a switch CTA for an inactive selected runtime and selects the newest active one", () => {
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

    render(<InactiveRuntimeNotice />);

    expect(screen.getByText("Selected runtime is inactive")).toBeTruthy();
    expect(screen.getByText("Old Browser is no longer active.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch" }));

    expect(useDevtoolsStore.getState().selectedRuntimeId).toBe("runtime-new");
  });
});
