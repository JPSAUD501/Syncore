import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";

export type QueryInvalidationEvent = Extract<
  SyncoreDevtoolsEvent,
  { type: "query.invalidated" }
>;

type QueryExecutionEvent = Extract<
  SyncoreDevtoolsEvent,
  { type: "query.executed" }
>;

function baseQueryId(queryId: string): string {
  const separatorIndex = queryId.indexOf(":");
  return separatorIndex === -1 ? queryId : queryId.slice(0, separatorIndex);
}

function addInvalidation(
  index: Map<string, QueryInvalidationEvent[]>,
  queryId: string,
  invalidation: QueryInvalidationEvent
) {
  const list = index.get(queryId) ?? [];
  if (!list.includes(invalidation)) {
    list.push(invalidation);
    index.set(queryId, list);
  }
}

export function isVisibleActivityEvent(event: SyncoreDevtoolsEvent): boolean {
  return event.type !== "query.invalidated";
}

export function buildInvalidationsByQueryId(
  events: SyncoreDevtoolsEvent[]
): Map<string, QueryInvalidationEvent[]> {
  const index = new Map<string, QueryInvalidationEvent[]>();
  const queryExecutions = events.filter(
    (event): event is QueryExecutionEvent => event.type === "query.executed"
  );

  for (const event of events) {
    if (event.type !== "query.invalidated") {
      continue;
    }

    addInvalidation(index, event.queryId, event);
    addInvalidation(index, baseQueryId(event.queryId), event);

    if (event.rerunExecutionId) {
      for (const query of queryExecutions) {
        if (query.executionId === event.rerunExecutionId) {
          addInvalidation(index, query.queryId, event);
          addInvalidation(index, baseQueryId(query.queryId), event);
        }
      }
    }
  }

  return index;
}

export function getInvalidationsForQuery(
  event: QueryExecutionEvent,
  index: Map<string, QueryInvalidationEvent[]>
): QueryInvalidationEvent[] {
  const exact = index.get(event.queryId) ?? [];
  const base = index.get(baseQueryId(event.queryId)) ?? [];
  return [...new Set([...exact, ...base])].filter((invalidation) =>
    invalidationMatchesQueryExecution(invalidation, event)
  );
}

function invalidationMatchesQueryExecution(
  invalidation: QueryInvalidationEvent,
  event: QueryExecutionEvent
): boolean {
  if (invalidation.rerunExecutionId) {
    return event.executionId === invalidation.rerunExecutionId;
  }

  return event.timestamp >= invalidation.timestamp;
}

export function formatInvalidationTitle(
  invalidations: QueryInvalidationEvent[]
): string {
  const latest = invalidations[0];
  if (!latest) {
    return "Query reran after an invalidation.";
  }
  return latest.causedByExecutionId
    ? `Reran after invalidation by ${latest.causedByExecutionId}`
    : `Reran after ${latest.reason}`;
}
