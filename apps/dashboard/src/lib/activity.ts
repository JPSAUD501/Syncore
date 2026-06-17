import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import {
  DASHBOARD_ACTIVITY_STORAGE_KEY,
  readBooleanPreference,
  writeBooleanPreference
} from "./storage";

export type ActivityOrigin = "app" | "dashboard";

export function getActivityOrigin(event: SyncoreDevtoolsEvent): ActivityOrigin {
  return event.origin === "dashboard" ? "dashboard" : "app";
}

export function getActivityOriginLabel(event: SyncoreDevtoolsEvent): string {
  return getActivityOrigin(event) === "dashboard" ? "Dashboard" : "App";
}

export function isDashboardActivity(event: SyncoreDevtoolsEvent): boolean {
  return getActivityOrigin(event) === "dashboard";
}

export function filterActivityEvents(
  events: SyncoreDevtoolsEvent[],
  includeDashboardActivity: boolean
) {
  if (includeDashboardActivity) {
    return events;
  }
  return events.filter((event) => !isDashboardActivity(event));
}

export function summarizeActivityEvents(events: SyncoreDevtoolsEvent[]) {
  let queryCount = 0;
  let mutationCount = 0;
  let actionCount = 0;
  let errorCount = 0;

  for (const event of events) {
    if (event.type === "query.executed") {
      queryCount += 1;
    }
    if (event.type === "mutation.committed") {
      mutationCount += 1;
    }
    if (event.type === "action.completed") {
      actionCount += 1;
      if (event.error) {
        errorCount += 1;
      }
    }
    if (event.type === "log" && event.level === "error") {
      errorCount += 1;
    }
  }

  return {
    queryCount,
    mutationCount,
    actionCount,
    errorCount
  };
}

export function readDashboardActivityPreference() {
  return readBooleanPreference(DASHBOARD_ACTIVITY_STORAGE_KEY);
}

export function writeDashboardActivityPreference(value: boolean) {
  writeBooleanPreference(DASHBOARD_ACTIVITY_STORAGE_KEY, value);
}
