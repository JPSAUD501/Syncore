import { describe, expect, it } from "vitest";
import {
  EVENT_BADGE_VARIANTS,
  EVENT_COLORS,
  formatInvalidationSourceId,
  getEventSummary,
  normalizeFunctionName,
  shortenUuidTokens,
  shortenDisplayId
} from "./eventPresentation";

describe("eventPresentation", () => {
  it("normalizes function names for display", () => {
    expect(normalizeFunctionName("auth/signIn")).toBe("auth:signIn");
  });

  it("shortens ids to 8 characters", () => {
    expect(shortenDisplayId("1234567890abcdef")).toBe("12345678");
  });

  it("formats invalidation source ids from the query id", () => {
    expect(formatInvalidationSourceId("8765432100000000:stale")).toBe("87654321");
  });

  it("shortens uuids embedded inside invalidation reasons", () => {
    expect(
      shortenUuidTokens("Mutation da1dd7df-a8b7-49de-a2aa-c3639af79d3c changed projects")
    ).toBe("Mutation da1dd7df changed projects");
  });

  it("uses a distinct but non-alarmist style for invalidated queries", () => {
    expect(EVENT_BADGE_VARIANTS["query.invalidated"]).toBe("secondary");
    expect(EVENT_COLORS["query.invalidated"]).toBe("text-emerald-600");
  });

  it("includes normalized function names and short ids in event summaries", () => {
    expect(
      getEventSummary({
        type: "mutation.committed",
        runtimeId: "runtime-1",
        mutationId: "1122334455667788",
        functionName: "auth/signIn",
        changedTables: ["users"],
        durationMs: 4,
        timestamp: 1
      })
    ).toBe("auth:signIn · 11223344");
  });

  it("shortens uuids inside invalidation summaries", () => {
    expect(
      getEventSummary({
        type: "query.invalidated",
        runtimeId: "runtime-1",
        queryId: "tasks/workspace:stale",
        reason: "Mutation da1dd7df-a8b7-49de-a2aa-c3639af79d3c changed projects",
        timestamp: 1
      })
    ).toBe("tasks/wo · Mutation da1dd7df changed projects");
  });
});
