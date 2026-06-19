import type {
  DocumentChangePreview,
  ExecutionTrace,
  SyncoreDevtoolsEvent
} from "@syncore/devtools-protocol";

export interface TraceIndex {
  traces: ExecutionTrace[];
  byExecutionId: Map<string, ExecutionTrace>;
  byQueryId: Map<string, ExecutionTrace>;
  byFunctionName: Map<string, ExecutionTrace[]>;
  byDocument: Map<string, ExecutionTrace[]>;
  invalidationsByCause: Map<string, Array<Extract<SyncoreDevtoolsEvent, { type: "query.invalidated" }>>>;
}

export function buildTraceIndex(events: SyncoreDevtoolsEvent[]): TraceIndex {
  const traces: ExecutionTrace[] = [];
  const byExecutionId = new Map<string, ExecutionTrace>();
  const byQueryId = new Map<string, ExecutionTrace>();
  const byFunctionName = new Map<string, ExecutionTrace[]>();
  const byDocument = new Map<string, ExecutionTrace[]>();
  const invalidationsByCause = new Map<
    string,
    Array<Extract<SyncoreDevtoolsEvent, { type: "query.invalidated" }>>
  >();

  for (const event of events) {
    if (event.type === "query.invalidated") {
      if (event.causedByExecutionId) {
        const list = invalidationsByCause.get(event.causedByExecutionId) ?? [];
        list.push(event);
        invalidationsByCause.set(event.causedByExecutionId, list);
      }
      continue;
    }

    const trace = traceFromEvent(event);
    if (!trace) {
      continue;
    }
    traces.push(trace);
    byExecutionId.set(trace.executionId, trace);
    if (event.type === "query.executed") {
      byQueryId.set(event.queryId, trace);
    }
    if (trace.functionName) {
      const list = byFunctionName.get(trace.functionName) ?? [];
      list.push(trace);
      byFunctionName.set(trace.functionName, list);
    }
    for (const change of trace.changedDocumentsPreview ?? []) {
      const key = documentTraceKey(change.table, change.id);
      const list = byDocument.get(key) ?? [];
      list.push(trace);
      byDocument.set(key, list);
    }
  }

  return {
    traces,
    byExecutionId,
    byQueryId,
    byFunctionName,
    byDocument,
    invalidationsByCause
  };
}

export function documentTraceKey(table: string, id: string): string {
  return `${table}:${id}`;
}

export function getTraceDocumentChanges(
  trace: ExecutionTrace | null | undefined
): DocumentChangePreview[] {
  return trace?.changedDocumentsPreview ?? [];
}

function traceFromEvent(event: SyncoreDevtoolsEvent): ExecutionTrace | null {
  switch (event.type) {
    case "query.executed":
      if (!event.executionId) {
        return null;
      }
      return {
        executionId: event.executionId,
        ...(event.parentExecutionId
          ? { parentExecutionId: event.parentExecutionId }
          : {}),
        kind: "query",
        functionName: event.functionName,
        ...(event.argsPreview ? { argsPreview: event.argsPreview } : {}),
        ...(event.resultPreview ? { resultPreview: event.resultPreview } : {}),
        readScopes: event.readScopes ?? event.dependencies
      };
    case "mutation.committed":
      if (!event.executionId) {
        return null;
      }
      return {
        executionId: event.executionId,
        ...(event.parentExecutionId
          ? { parentExecutionId: event.parentExecutionId }
        : {}),
        kind: event.functionName === "__devtools__/mutation" ? "dashboard" : "mutation",
        functionName: event.functionName,
        ...(event.argsPreview ? { argsPreview: event.argsPreview } : {}),
        ...(event.resultPreview ? { resultPreview: event.resultPreview } : {}),
        ...(event.writeScopes ? { writeScopes: event.writeScopes } : {}),
        ...(event.changedScopes ? { changedScopes: event.changedScopes } : {}),
        ...(event.changedDocumentsPreview
          ? { changedDocumentsPreview: event.changedDocumentsPreview }
          : {}),
        ...(event.invalidatedQueryIds
          ? { invalidatedQueryIds: event.invalidatedQueryIds }
          : {})
      };
    case "action.completed":
      if (!event.executionId) {
        return null;
      }
      return {
        executionId: event.executionId,
        ...(event.parentExecutionId
          ? { parentExecutionId: event.parentExecutionId }
        : {}),
        kind: "action",
        functionName: event.functionName,
        ...(event.argsPreview ? { argsPreview: event.argsPreview } : {}),
        ...(event.resultPreview ? { resultPreview: event.resultPreview } : {}),
        ...(event.error ? { error: event.error } : {}),
        ...(event.writeScopes ? { writeScopes: event.writeScopes } : {}),
        ...(event.changedScopes ? { changedScopes: event.changedScopes } : {}),
        ...(event.changedDocumentsPreview
          ? { changedDocumentsPreview: event.changedDocumentsPreview }
          : {}),
        ...(event.invalidatedQueryIds
          ? { invalidatedQueryIds: event.invalidatedQueryIds }
          : {})
      };
    case "scheduler.tick":
      return event.executionId
        ? {
            executionId: event.executionId,
            kind: "scheduler",
            changedScopes: ["scheduler.jobs"]
          }
        : null;
    default:
      return null;
  }
}
