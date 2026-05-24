import { describe, expect, it } from "vitest";
import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import { buildTraceIndex, documentTraceKey } from "./traces";

describe("buildTraceIndex", () => {
  it("indexes executions by id, function, document and invalidation cause", () => {
    const events: SyncoreDevtoolsEvent[] = [
      {
        type: "mutation.committed",
        runtimeId: "runtime-1",
        mutationId: "mutation-1",
        executionId: "exec-1",
        functionName: "tasks/create",
        changedTables: ["tasks"],
        changedDocumentsPreview: [
          {
            table: "tasks",
            id: "task-1",
            operation: "insert"
          }
        ],
        invalidatedQueryIds: ["tasks/list:{}"],
        durationMs: 4,
        timestamp: 2
      },
      {
        type: "query.invalidated",
        runtimeId: "runtime-1",
        queryId: "tasks/list:{}",
        reason: "Execution exec-1 touched table:tasks",
        causedByExecutionId: "exec-1",
        changedScopes: ["table:tasks"],
        matchedScopes: ["table:tasks"],
        rerunExecutionId: "exec-2",
        timestamp: 3
      }
    ];

    const index = buildTraceIndex(events);

    expect(index.byExecutionId.get("exec-1")?.functionName).toBe("tasks/create");
    expect(index.byFunctionName.get("tasks/create")).toHaveLength(1);
    expect(index.byDocument.get(documentTraceKey("tasks", "task-1"))).toHaveLength(1);
    expect(index.invalidationsByCause.get("exec-1")?.[0]?.rerunExecutionId).toBe("exec-2");
  });
});
