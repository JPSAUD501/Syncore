import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";

export const DASHBOARD_ACTIVITY_STORAGE_KEY =
  "syncore-dashboard-include-dashboard-activity";

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
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(DASHBOARD_ACTIVITY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeDashboardActivityPreference(value: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      DASHBOARD_ACTIVITY_STORAGE_KEY,
      value ? "1" : "0"
    );
  } catch {
    /* ignore storage failures */
  }
}
