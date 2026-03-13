import type { SyncoreDevtoolsEvent } from "@syncore/devtools-protocol";
import type React from "react";
import {
  Activity,
  AlertTriangle,
  Circle,
  Clock,
  Database,
  HardDrive,
  Search,
  Zap
} from "lucide-react";
import { formatDuration } from "./utils";
import { getPublicRuntimeId } from "./store";

export type EventType = SyncoreDevtoolsEvent["type"];

export type EventBadgeVariant =
  | "success"
  | "info"
  | "warning"
  | "destructive"
  | "secondary"
  | "default";

export const EVENT_LABELS: Record<EventType, string> = {
  "query.executed": "Query",
  "query.invalidated": "Invalidated",
  "mutation.committed": "Mutation",
  "action.completed": "Action",
  "scheduler.tick": "Scheduler",
  "storage.updated": "Storage",
  "runtime.connected": "Connected",
  "runtime.disconnected": "Disconnected",
  log: "Log"
};

export const EVENT_COLORS: Record<EventType, string> = {
  "query.executed": "text-fn-query",
  "query.invalidated": "text-emerald-600",
  "mutation.committed": "text-fn-mutation",
  "action.completed": "text-fn-action",
  "scheduler.tick": "text-fn-cron",
  "storage.updated": "text-info",
  "runtime.connected": "text-success",
  "runtime.disconnected": "text-error",
  log: "text-text-secondary"
};

export const EVENT_BADGE_VARIANTS: Record<EventType, EventBadgeVariant> = {
  "query.executed": "success",
  "query.invalidated": "secondary",
  "mutation.committed": "info",
  "action.completed": "default",
  "scheduler.tick": "warning",
  "storage.updated": "info",
  "runtime.connected": "success",
  "runtime.disconnected": "destructive",
  log: "secondary"
};

export const EVENT_ICONS: Record<
  EventType,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  "query.executed": Search,
  "query.invalidated": AlertTriangle,
  "mutation.committed": Database,
  "action.completed": Zap,
  "scheduler.tick": Clock,
  "storage.updated": HardDrive,
  "runtime.connected": Circle,
  "runtime.disconnected": Circle,
  log: Activity
};

export function normalizeFunctionName(functionName: string): string {
  return functionName.replaceAll("/", ":");
}

export function shortenDisplayId(value: string, length = 8): string {
  return value.slice(0, length);
}

export function shortenUuidTokens(value: string): string {
  return value.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    (match) => shortenDisplayId(match)
  );
}

export function formatInvalidationSourceId(queryId: string): string {
  const separatorIndex = queryId.indexOf(":");
  const sourceId = separatorIndex === -1 ? queryId : queryId.slice(0, separatorIndex);
  return shortenDisplayId(sourceId);
}

export function getEventSummary(event: SyncoreDevtoolsEvent): string {
  switch (event.type) {
    case "query.executed":
      return `${normalizeFunctionName(event.functionName)} · ${shortenDisplayId(event.queryId)}`;
    case "query.invalidated":
      return `${formatInvalidationSourceId(event.queryId)} · ${shortenUuidTokens(event.reason)}`;
    case "mutation.committed":
      return `${normalizeFunctionName(event.functionName)} · ${shortenDisplayId(event.mutationId)}`;
    case "action.completed":
      return `${normalizeFunctionName(event.functionName)} · ${shortenDisplayId(event.actionId)}`;
    case "scheduler.tick":
      return `${event.executedJobIds.length} job(s)`;
    case "storage.updated":
      return `${event.operation} ${event.storageId}`;
    case "runtime.connected":
      return `${event.platform} connected`;
    case "runtime.disconnected":
      return "Runtime disconnected";
    case "log":
      return event.message;
    default:
      return "";
  }
}

export function getEventDuration(event: SyncoreDevtoolsEvent): string | null {
  if ("durationMs" in event && typeof event.durationMs === "number") {
    return formatDuration(event.durationMs);
  }
  return null;
}

export function getEventRuntimeTag(
  event: SyncoreDevtoolsEvent,
  runtimeMap: Map<string, { label: string; publicId: string }>
): string {
  if (event.origin === "dashboard") {
    return "dashboard";
  }
  const runtime = runtimeMap.get(event.runtimeId);
  if (!runtime) {
    return getPublicRuntimeId(event.runtimeId, runtimeMap.keys());
  }
  return runtime.label;
}

export function getEventDetailRows(
  event: SyncoreDevtoolsEvent
): Array<{ label: string; value: string; mono?: boolean; error?: boolean }> {
  switch (event.type) {
    case "query.executed":
      return [
        { label: "Function", value: normalizeFunctionName(event.functionName), mono: true },
        { label: "Query ID", value: shortenDisplayId(event.queryId), mono: true },
        { label: "Duration", value: formatDuration(event.durationMs) },
        {
          label: "Dependencies",
          value: event.dependencies.length > 0 ? event.dependencies.join(", ") : "none",
          mono: true
        }
      ];
    case "query.invalidated":
      return [
        {
          label: "Invalidated By",
          value: formatInvalidationSourceId(event.queryId),
          mono: true
        },
        { label: "Reason", value: shortenUuidTokens(event.reason) }
      ];
    case "mutation.committed":
      return [
        { label: "Function", value: normalizeFunctionName(event.functionName), mono: true },
        { label: "Mutation ID", value: shortenDisplayId(event.mutationId), mono: true },
        { label: "Duration", value: formatDuration(event.durationMs) },
        {
          label: "Changed Tables",
          value: event.changedTables.join(", ") || "none",
          mono: true
        }
      ];
    case "action.completed":
      return [
        { label: "Function", value: normalizeFunctionName(event.functionName), mono: true },
        { label: "Action ID", value: shortenDisplayId(event.actionId), mono: true },
        { label: "Duration", value: formatDuration(event.durationMs) },
        ...(event.error ? [{ label: "Error", value: event.error, error: true }] : [])
      ];
    case "scheduler.tick":
      return [
        {
          label: "Executed Jobs",
          value: event.executedJobIds.join(", ") || "none",
          mono: true
        }
      ];
    case "storage.updated":
      return [
        { label: "Storage ID", value: event.storageId, mono: true },
        { label: "Operation", value: event.operation }
      ];
    default:
      return [];
  }
}
