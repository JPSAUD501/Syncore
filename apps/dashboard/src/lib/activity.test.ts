import { describe, expect, it } from "vitest";
import {
  filterActivityEvents,
  getActivityOriginLabel,
  summarizeActivityEvents
} from "./activity";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";

const events: SyncoreDevtoolsEvent[] = [
  {
    type: "query.executed",
    runtimeId: "runtime-1",
    queryId: "query-1",
    functionName: "tasks:list",
    dependencies: [],
    durationMs: 4,
    timestamp: 1
  },
  {
    type: "mutation.committed",
    runtimeId: "runtime-1",
    mutationId: "mutation-1",
    functionName: "__devtools__/mutation",
    changedTables: ["tasks"],
    durationMs: 7,
    timestamp: 2,
    origin: "dashboard"
  }
];

describe("activity helpers", () => {
  it("hides dashboard-origin events by default", () => {
    const visibleEvents = filterActivityEvents(events, false);

    expect(visibleEvents).toHaveLength(1);
    expect(visibleEvents[0]?.type).toBe("query.executed");
  });

  it("counts only visible activity", () => {
    const visibleEvents = filterActivityEvents(events, false);
    const counts = summarizeActivityEvents(visibleEvents);

    expect(counts.queryCount).toBe(1);
    expect(counts.mutationCount).toBe(0);
  });

  it("returns a readable origin label", () => {
    expect(getActivityOriginLabel(events[0]!)).toBe("App");
    expect(getActivityOriginLabel(events[1]!)).toBe("Dashboard");
  });
});
