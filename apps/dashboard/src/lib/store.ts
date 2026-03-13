import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  SyncoreDevtoolsClientMessage,
  SyncoreDevtoolsCommandPayload,
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsMessage,
  SyncoreDevtoolsSubscriptionPayload,
  SyncoreDevtoolsSubscriptionResultPayload,
  SyncoreRuntimeSummary,
  SyncoreDevtoolsCommandResultPayload
} from "@syncore/devtools-protocol";
import {
  createPublicRuntimeId as createSharedPublicRuntimeId,
  createPublicTargetId as createSharedPublicTargetId
} from "@syncore/devtools-protocol";
import {
  readDashboardActivityPreference,
  writeDashboardActivityPreference
} from "./activity";

const MAX_EVENTS = 500;
const HUB_RUNTIME_ID = "syncore-dev-hub";
const DASHBOARD_TOKEN_STORAGE_KEY = "syncore-dashboard-hub-token";
const RECONNECT_DELAY = 2000;
const REQUEST_TIMEOUT = 10_000;
const DEBUG_DEVTOOLS = false;
const debugCounters = new Map<string, number>();

function sanitizeHubToken(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.replace(/[^A-Za-z0-9]/g, "");
  return sanitized.length > 0 ? sanitized : null;
}

function readDashboardTokenFromUrl(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const searchParams = new URLSearchParams(window.location.search);
  return sanitizeHubToken(
    searchParams.get("token") ?? searchParams.get("hubToken")
  );
}

function readStoredDashboardToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return sanitizeHubToken(
      window.localStorage.getItem(DASHBOARD_TOKEN_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

function writeStoredDashboardToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(DASHBOARD_TOKEN_STORAGE_KEY, token);
  } catch {
    /* ignore storage failures */
  }
}

function clearStoredDashboardToken(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(DASHBOARD_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore storage failures */
  }
}

function syncDashboardTokenInUrl(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  if (token) {
    url.searchParams.set("token", token);
    url.searchParams.delete("hubToken");
  } else {
    url.searchParams.delete("token");
    url.searchParams.delete("hubToken");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function resolveInitialHubToken(): string | null {
  const urlToken = readDashboardTokenFromUrl();
  if (urlToken) {
    writeStoredDashboardToken(urlToken);
    return urlToken;
  }
  const storedToken = readStoredDashboardToken();
  if (storedToken) {
    syncDashboardTokenInUrl(storedToken);
    return storedToken;
  }
  return null;
}

function buildDevtoolsWebSocketUrl(token: string): string {
  return `ws://localhost:4311/?token=${encodeURIComponent(token)}`;
}

const INITIAL_HUB_TOKEN = resolveInitialHubToken();

function debugLog(key: string, ...args: unknown[]) {
  if (!DEBUG_DEVTOOLS) {
    return;
  }
  const count = (debugCounters.get(key) ?? 0) + 1;
  debugCounters.set(key, count);
  if (count <= 20 || count % 50 === 0) {
    console.debug(...args, count > 20 ? { count } : undefined);
  }
}

interface RuntimeMeta {
  runtimeId: string;
  platform: string;
  appName?: string;
  origin?: string;
  sessionLabel?: string;
  targetKind?: "client" | "project";
  storageProtocol?: string;
  databaseLabel?: string;
  storageIdentity?: string;
}

interface RuntimeState extends RuntimeMeta {
  connected: boolean;
  events: SyncoreDevtoolsEvent[];
  summary: SyncoreRuntimeSummary | null;
  activeQueries: Array<{
    id: string;
    functionName: string;
    dependencyKeys: string[];
    lastRunAt: number;
  }>;
  queryCount: number;
  mutationCount: number;
  actionCount: number;
  errorCount: number;
  liveQueryVersion: number;
  lastSubscriptionError: string | null;
}

type RuntimeSelectionMode = "auto-single" | "all" | "runtime" | null;

const EMPTY_RUNTIME_STATE = {
  events: [],
  summary: null,
  activeQueries: [],
  queryCount: 0,
  mutationCount: 0,
  actionCount: 0,
  errorCount: 0,
  liveQueryVersion: 0,
  lastSubscriptionError: null
} satisfies Pick<
  RuntimeState,
  | "events"
  | "summary"
  | "activeQueries"
  | "queryCount"
  | "mutationCount"
  | "actionCount"
  | "errorCount"
  | "liveQueryVersion"
  | "lastSubscriptionError"
>;

/* ------------------------------------------------------------------ */
/*  Store types                                                        */
/* ------------------------------------------------------------------ */

interface PendingRequest {
  targetRuntimeId: string;
  resolve: (payload: SyncoreDevtoolsCommandResultPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SubscriptionRecord {
  subscriptionId: string;
  runtimeId: string;
  listeners: Set<(payload: SyncoreDevtoolsSubscriptionResultPayload) => void>;
  errorListeners: Set<(message: string) => void>;
  payload: SyncoreDevtoolsSubscriptionPayload;
  sent: boolean;
}

interface DevtoolsState {
  connected: boolean;
  runtimes: Record<string, RuntimeState>;
  selectedTargetId: string | null;
  selectedRuntimeId: string | null;
  selectedRuntimeFilter: string | null;
  selectedRuntimeSelectionMode: RuntimeSelectionMode;
  includeDashboardActivity: boolean;
  hubToken: string | null;
  authRequired: boolean;
  authError: string | null;
  _handleMessage: (msg: SyncoreDevtoolsMessage) => void;
  _setConnected: (v: boolean) => void;
  _markAllRuntimesDisconnected: () => void;
  selectTarget: (targetId: string | null) => void;
  selectRuntime: (runtimeId: string | null) => void;
  selectRuntimeFilter: (runtimeId: string | null) => void;
  setIncludeDashboardActivity: (value: boolean) => void;
  toggleIncludeDashboardActivity: () => void;
  setHubToken: (value: string) => void;
  requestHubToken: (error?: string | null) => void;
  clearEvents: (runtimeId?: string) => void;
}

export interface TargetState {
  id: string;
  kind: "client" | "project";
  label: string;
  platform: string;
  runtimeIds: string[];
  runtimes: RuntimeState[];
  connected: boolean;
  connectedSessions: number;
  appName?: string;
  origin?: string;
  storageProtocol?: string;
  databaseLabel?: string;
  storageIdentity?: string;
}

function createRuntimeState(meta: RuntimeMeta): RuntimeState {
  return {
    ...meta,
    connected: true,
    ...EMPTY_RUNTIME_STATE
  };
}

function resetRuntimeState(
  runtime: RuntimeState,
  overrides?: Partial<Pick<RuntimeState, "connected" | "events">>
): RuntimeState {
  return {
    ...runtime,
    ...EMPTY_RUNTIME_STATE,
    connected: overrides?.connected ?? runtime.connected,
    events: overrides?.events ?? EMPTY_RUNTIME_STATE.events
  };
}

function ensureRuntime(
  runtimes: Record<string, RuntimeState>,
  meta: RuntimeMeta
): RuntimeState {
  const existing = runtimes[meta.runtimeId];
  if (!existing) {
    return createRuntimeState(meta);
  }
  return {
    ...existing,
    connected: true,
    platform: meta.platform,
    ...(meta.targetKind || existing.targetKind
      ? { targetKind: meta.targetKind ?? existing.targetKind }
      : {}),
    ...(meta.appName ? { appName: meta.appName } : {}),
    ...(meta.origin ? { origin: meta.origin } : {}),
    ...(meta.sessionLabel ? { sessionLabel: meta.sessionLabel } : {}),
    ...(meta.storageProtocol
      ? { storageProtocol: meta.storageProtocol }
      : {}),
    ...(meta.databaseLabel ? { databaseLabel: meta.databaseLabel } : {}),
    ...(meta.storageIdentity
      ? { storageIdentity: meta.storageIdentity }
      : {})
  };
}

function isProjectRuntime(
  runtime: Pick<RuntimeState, "targetKind">
): boolean {
  return runtime.targetKind === "project";
}

export function getPublicRuntimeId(
  runtimeId: string,
  runtimeIds?: Iterable<string>
): string {
  return createSharedPublicRuntimeId(runtimeId, runtimeIds);
}

export interface ParsedSessionLabel {
  name: string;
  browser?: string;
}

export function parseSessionLabel(label: string | undefined): ParsedSessionLabel | undefined {
  if (!label) return undefined;
  const match = label.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
  if (!match) return { name: label };
  return {
    name: match[1] || label,
    ...(match[2] ? { browser: match[2] } : {})
  };
}

export function getRuntimeLabel(
  runtime: Pick<RuntimeMeta, "sessionLabel" | "appName" | "platform">
): string {
  const parsed = parseSessionLabel(runtime.sessionLabel);
  return parsed?.name ?? runtime.appName ?? runtime.platform;
}

export function getRuntimeBrowser(
  runtime: Pick<RuntimeMeta, "sessionLabel" | "platform">
): string | undefined {
  const parsed = parseSessionLabel(runtime.sessionLabel);
  return parsed?.browser;
}

function createPublicTargetId(
  key: string,
  keys: string[]
): string {
  return createSharedPublicTargetId(key, keys);
}

function getTargetGroupKey(runtime: RuntimeState): string {
  return isProjectRuntime(runtime)
    ? "project"
    : runtime.storageIdentity ?? `runtime::${runtime.runtimeId}`;
}

function getTargetLabel(runtime: RuntimeState, _connectedSessions: number): string {
  if (isProjectRuntime(runtime)) {
    return runtime.databaseLabel ?? runtime.appName ?? runtime.platform;
  }
  const parsed = parseSessionLabel(runtime.sessionLabel);
  const base =
    parsed?.name ??
    runtime.appName ??
    runtime.databaseLabel ??
    runtime.origin ??
    `${runtime.platform} client`;
  return parsed?.browser ? `${base} (${parsed.browser})` : base;
}

function buildTargets(runtimes: Record<string, RuntimeState>): TargetState[] {
  const groups = new Map<string, RuntimeState[]>();
  for (const runtime of sortRuntimes(runtimes)) {
    const key = getTargetGroupKey(runtime);
    const group = groups.get(key) ?? [];
    group.push(runtime);
    groups.set(key, group);
  }

  const keys = [...groups.keys()];
  return [...groups.entries()]
    .map(([key, group]) => {
      const sorted = [...group];
      const primary =
        sorted.find((runtime) => runtime.connected) ?? sorted[0]!;
      const connectedSessions = sorted.filter((runtime) => runtime.connected).length;
      const kind: TargetState["kind"] = isProjectRuntime(primary)
        ? "project"
        : "client";
      return {
        id: kind === "project" ? "project" : createPublicTargetId(key, keys),
        kind,
        label: getTargetLabel(primary, connectedSessions || sorted.length),
        platform: primary.platform,
        runtimeIds: sorted.map((runtime) => runtime.runtimeId),
        runtimes: sorted,
        connected: sorted.some((runtime) => runtime.connected),
        connectedSessions,
        ...(primary.appName ? { appName: primary.appName } : {}),
        ...(primary.origin ? { origin: primary.origin } : {}),
        ...(primary.storageProtocol
          ? { storageProtocol: primary.storageProtocol }
          : {}),
        ...(primary.databaseLabel ? { databaseLabel: primary.databaseLabel } : {}),
        ...(primary.storageIdentity
          ? { storageIdentity: primary.storageIdentity }
          : {})
      };
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "client" ? -1 : 1;
      }
      if (left.connected !== right.connected) {
        return left.connected ? -1 : 1;
      }
      return left.label.localeCompare(right.label);
    });
}

const targetsSnapshotCache = new WeakMap<
  Record<string, RuntimeState>,
  TargetState[]
>();

function getTargetsSnapshot(
  runtimes: Record<string, RuntimeState>
): TargetState[] {
  const cached = targetsSnapshotCache.get(runtimes);
  if (cached) {
    return cached;
  }
  const targets = buildTargets(runtimes);
  targetsSnapshotCache.set(runtimes, targets);
  return targets;
}

function countRuntimeEvents(events: SyncoreDevtoolsEvent[]) {
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

function getEventDedupKey(event: SyncoreDevtoolsEvent): string {
  switch (event.type) {
    case "mutation.committed":
      return `${event.type}:${event.runtimeId}:${event.mutationId}`;
    case "action.completed":
      return `${event.type}:${event.runtimeId}:${event.actionId}`;
    case "query.executed":
      return [
        event.type,
        event.runtimeId,
        event.functionName,
        event.timestamp,
        event.durationMs,
        JSON.stringify(event.dependencies),
        event.origin ?? "app"
      ].join(":");
    case "log":
      return [
        event.type,
        event.runtimeId,
        event.level,
        event.message,
        event.timestamp,
        event.origin ?? "app"
      ].join(":");
    case "runtime.connected":
      return `${event.type}:${event.runtimeId}:${event.timestamp}`;
    case "runtime.disconnected":
      return `${event.type}:${event.runtimeId}:${event.timestamp}`;
    default:
      return JSON.stringify(event);
  }
}

function prependUniqueEvents(
  existingEvents: SyncoreDevtoolsEvent[],
  incomingEvents: SyncoreDevtoolsEvent[]
): SyncoreDevtoolsEvent[] {
  if (incomingEvents.length === 0) {
    return existingEvents;
  }

  const knownKeys = new Set(existingEvents.map(getEventDedupKey));
  const uniqueIncoming: SyncoreDevtoolsEvent[] = [];

  for (const event of incomingEvents) {
    const key = getEventDedupKey(event);
    if (knownKeys.has(key)) {
      continue;
    }
    knownKeys.add(key);
    uniqueIncoming.push(event);
  }

  if (uniqueIncoming.length === 0) {
    return existingEvents;
  }

  return [...uniqueIncoming, ...existingEvents].slice(0, MAX_EVENTS);
}

function getActiveRuntime(state: DevtoolsState): RuntimeState | null {
  const selectedRuntimeId = state.selectedRuntimeId;
  if (!selectedRuntimeId) {
    return null;
  }
  return state.runtimes[selectedRuntimeId] ?? null;
}

function resolveSelectionState(
  runtimes: Record<string, RuntimeState>,
  currentSelectedTargetId: string | null,
  currentSelectedRuntimeFilter: string | null,
  currentSelectedRuntimeSelectionMode: RuntimeSelectionMode,
  preferredRuntimeId?: string
): {
  selectedTargetId: string | null;
  selectedRuntimeFilter: string | null;
  selectedRuntimeId: string | null;
  selectedRuntimeSelectionMode: RuntimeSelectionMode;
} {
  const targets = getTargetsSnapshot(runtimes);
  if (targets.length === 0) {
    return {
      selectedTargetId: null,
      selectedRuntimeFilter: null,
      selectedRuntimeId: null,
      selectedRuntimeSelectionMode: null
    };
  }

  const preferredTarget =
    preferredRuntimeId
      ? targets.find((target) => target.runtimeIds.includes(preferredRuntimeId))
      : undefined;
  const currentTarget = currentSelectedTargetId
    ? targets.find((target) => target.id === currentSelectedTargetId)
    : undefined;
  const hasAnyConnectedTarget = targets.some((target) => target.connected);
  const selectedTarget =
    (currentTarget && (currentTarget.connected || !hasAnyConnectedTarget)
      ? currentTarget
      : undefined) ??
    preferredTarget ??
    targets.find((target) => target.kind === "client" && target.connected) ??
    targets.find((target) => target.kind === "project" && target.connected) ??
    targets.find((target) => target.kind === "client") ??
    targets[0] ??
    null;

  if (!selectedTarget) {
    return {
      selectedTargetId: null,
      selectedRuntimeFilter: null,
      selectedRuntimeId: null,
      selectedRuntimeSelectionMode: null
    };
  }

  if (selectedTarget.kind === "project") {
    return {
      selectedTargetId: selectedTarget.id,
      selectedRuntimeFilter: null,
      selectedRuntimeId:
        selectedTarget.runtimes.find((runtime) => runtime.connected)?.runtimeId ??
        selectedTarget.runtimes[0]?.runtimeId ??
        null,
      selectedRuntimeSelectionMode: null
    };
  }

  const availableRuntimes = selectedTarget.runtimes.filter(
    (runtime) => runtime.connected
  );
  const candidateRuntimes =
    availableRuntimes.length > 0 ? availableRuntimes : selectedTarget.runtimes;

  if (candidateRuntimes.length === 1) {
    const singleRuntimeId = candidateRuntimes[0]?.runtimeId ?? null;
    return {
      selectedTargetId: selectedTarget.id,
      selectedRuntimeFilter: singleRuntimeId,
      selectedRuntimeId: singleRuntimeId,
      selectedRuntimeSelectionMode: singleRuntimeId ? "auto-single" : null
    };
  }

  const filteredRuntime =
    typeof currentSelectedRuntimeFilter === "string" &&
    currentSelectedRuntimeFilter !== "all"
      ? candidateRuntimes.find(
          (runtime) => runtime.runtimeId === currentSelectedRuntimeFilter
        ) ?? null
      : null;
  const hasExplicitRuntimeFilter =
    currentSelectedRuntimeSelectionMode === "runtime" &&
    typeof currentSelectedRuntimeFilter === "string" &&
    currentSelectedRuntimeFilter !== "all" &&
    filteredRuntime !== null;
  const selectedRuntimeFilter = hasExplicitRuntimeFilter
    ? currentSelectedRuntimeFilter
    : "all";
  const selectedRuntimeId =
    selectedRuntimeFilter && selectedRuntimeFilter !== "all"
      ? selectedRuntimeFilter
      : candidateRuntimes.find((runtime) => runtime.connected)?.runtimeId ??
        candidateRuntimes[0]?.runtimeId ??
        null;

  return {
    selectedTargetId: selectedTarget.id,
    selectedRuntimeFilter,
    selectedRuntimeId,
    selectedRuntimeSelectionMode:
      selectedRuntimeFilter === "all"
        ? "all"
        : selectedRuntimeFilter
          ? "runtime"
          : null
  };
}

function sortRuntimes(runtimes: Record<string, RuntimeState>): RuntimeState[] {
  return Object.values(runtimes).sort((a, b) => {
    if (isProjectRuntime(a) !== isProjectRuntime(b)) {
      return isProjectRuntime(a) ? 1 : -1;
    }
    if (a.connected !== b.connected) {
      return a.connected ? -1 : 1;
    }
    const aLast = a.events[0]?.timestamp ?? a.summary?.connectedAt ?? 0;
    const bLast = b.events[0]?.timestamp ?? b.summary?.connectedAt ?? 0;
    return bLast - aLast;
  });
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useDevtoolsStore = create<DevtoolsState>((set) => ({
  connected: false,
  runtimes: {},
  selectedTargetId: null,
  selectedRuntimeId: null,
  selectedRuntimeFilter: null,
  selectedRuntimeSelectionMode: null,
  includeDashboardActivity: readDashboardActivityPreference(),
  hubToken: INITIAL_HUB_TOKEN,
  authRequired: INITIAL_HUB_TOKEN === null,
  authError: INITIAL_HUB_TOKEN === null
    ? "Paste the devtools token printed by `syncorejs dev`."
    : null,

  _setConnected: (v) =>
    set((state) => (state.connected === v ? state : { connected: v })),

  _markAllRuntimesDisconnected: () =>
    set((state) => {
      let changed = false;
      const runtimes = Object.fromEntries(
        Object.entries(state.runtimes).map(([runtimeId, runtime]) => {
          if (!runtime.connected) {
            return [runtimeId, runtime];
          }
          changed = true;
          return [runtimeId, resetRuntimeState(runtime, { connected: false })];
        })
      );
      if (!changed) {
        return state;
      }
        return {
          runtimes,
          ...resolveSelectionState(
            runtimes,
            state.selectedTargetId,
            state.selectedRuntimeFilter,
            state.selectedRuntimeSelectionMode
          )
        };
      }),

  selectTarget: (targetId) =>
    set((state) => {
      const nextSelection = resolveSelectionState(
        state.runtimes,
        targetId,
        null,
        null
      );
      return {
        selectedTargetId: nextSelection.selectedTargetId,
        selectedRuntimeFilter: nextSelection.selectedRuntimeFilter,
        selectedRuntimeId: nextSelection.selectedRuntimeId,
        selectedRuntimeSelectionMode: nextSelection.selectedRuntimeSelectionMode
      };
    }),

  selectRuntime: (runtimeId) =>
    set((state) => {
      if (!runtimeId) {
        const nextSelection = resolveSelectionState(
          state.runtimes,
          state.selectedTargetId,
          "all",
          "all"
        );
        return {
          selectedTargetId: nextSelection.selectedTargetId,
          selectedRuntimeFilter: nextSelection.selectedRuntimeFilter,
          selectedRuntimeId: nextSelection.selectedRuntimeId,
          selectedRuntimeSelectionMode: nextSelection.selectedRuntimeSelectionMode
        };
      }
      const target = getTargetsSnapshot(state.runtimes).find((entry) =>
        entry.runtimeIds.includes(runtimeId)
      );
      if (!target) {
        return state;
      }
      return {
        selectedTargetId: target.id,
        selectedRuntimeFilter: runtimeId,
        selectedRuntimeId: runtimeId,
        selectedRuntimeSelectionMode: "runtime"
      };
    }),

  selectRuntimeFilter: (runtimeId) =>
    set((state) => {
      const target = state.selectedTargetId
        ? getTargetsSnapshot(state.runtimes).find(
            (entry) => entry.id === state.selectedTargetId
          )
        : null;
      if (!target || target.kind === "project") {
        return state;
      }
      if (runtimeId && runtimeId !== "all" && !target.runtimeIds.includes(runtimeId)) {
        return state;
      }
      const nextSelection = resolveSelectionState(
        state.runtimes,
        target.id,
        runtimeId ?? "all",
        runtimeId && runtimeId !== "all" ? "runtime" : "all"
      );
      return {
        selectedTargetId: nextSelection.selectedTargetId,
        selectedRuntimeFilter: nextSelection.selectedRuntimeFilter,
        selectedRuntimeId: nextSelection.selectedRuntimeId,
        selectedRuntimeSelectionMode: nextSelection.selectedRuntimeSelectionMode
      };
    }),

  setIncludeDashboardActivity: (value) => {
    writeDashboardActivityPreference(value);
    set((state) =>
      state.includeDashboardActivity === value
        ? state
        : { includeDashboardActivity: value }
    );
  },

  toggleIncludeDashboardActivity: () =>
    set((state) => {
      const nextValue = !state.includeDashboardActivity;
      writeDashboardActivityPreference(nextValue);
      return { includeDashboardActivity: nextValue };
    }),

  setHubToken: (value) => {
    const nextToken = sanitizeHubToken(value);
    if (!nextToken) {
      set({
        authRequired: true,
        authError: "Enter a valid devtools token.",
        hubToken: null
      });
      return;
    }
    writeStoredDashboardToken(nextToken);
    syncDashboardTokenInUrl(nextToken);
    set({
      hubToken: nextToken,
      authRequired: false,
      authError: null
    });
    reconnectWithLatestToken();
  },

  requestHubToken: (error) => {
    clearStoredDashboardToken();
    syncDashboardTokenInUrl(null);
    set({
      connected: false,
      hubToken: null,
      authRequired: true,
      authError:
        error ?? "Paste the devtools token printed by `syncorejs dev`."
    });
  },

  _handleMessage: (msg) => {
    switch (msg.type) {
      case "hello":
        if (msg.runtimeId === HUB_RUNTIME_ID) {
          break;
        }
        flushSubscriptions(msg.runtimeId);
        set((state) => {
          const nextRuntime = ensureRuntime(state.runtimes, {
            runtimeId: msg.runtimeId,
            platform: msg.platform,
            ...(msg.targetKind ? { targetKind: msg.targetKind } : {}),
            ...(msg.appName ? { appName: msg.appName } : {}),
            ...(msg.origin ? { origin: msg.origin } : {}),
            ...(msg.sessionLabel ? { sessionLabel: msg.sessionLabel } : {}),
            ...(msg.storageProtocol
              ? { storageProtocol: msg.storageProtocol }
              : {}),
            ...(msg.databaseLabel ? { databaseLabel: msg.databaseLabel } : {}),
            ...(msg.storageIdentity
              ? { storageIdentity: msg.storageIdentity }
              : {})
          });
          const runtimes = {
            ...state.runtimes,
            [msg.runtimeId]: nextRuntime
          };
          return {
            runtimes,
            ...resolveSelectionState(
              runtimes,
              state.selectedTargetId,
              state.selectedRuntimeFilter,
              state.selectedRuntimeSelectionMode,
              msg.targetKind === "project" ? undefined : msg.runtimeId
            )
          };
        });
        break;

      case "event":
        if (msg.event.runtimeId === HUB_RUNTIME_ID) {
          break;
        }
        set((state) => {
          const runtimeId = msg.event.runtimeId;
          const baseRuntime = ensureRuntime(state.runtimes, {
            runtimeId,
            platform:
              state.runtimes[runtimeId]?.platform ??
              state.runtimes[runtimeId]?.summary?.platform ??
              "unknown"
          });
          const events = prependUniqueEvents(baseRuntime.events, [msg.event]);
          if (events === baseRuntime.events) {
            return state;
          }
          const e = msg.event;
          const counts = countRuntimeEvents(events);
          const nextRuntime: RuntimeState =
            e.type === "runtime.disconnected"
              ? {
                  ...baseRuntime,
                  connected: false,
                  events,
                  ...counts,
                  liveQueryVersion: baseRuntime.liveQueryVersion + 1,
                  lastSubscriptionError: null
                }
              : {
                  ...baseRuntime,
                  connected: true,
                  events,
                  ...counts,
                  liveQueryVersion: baseRuntime.liveQueryVersion + 1,
                  lastSubscriptionError: null
                };
          const runtimes = {
            ...state.runtimes,
            [runtimeId]: nextRuntime
          };
          return {
            runtimes,
            ...resolveSelectionState(
              runtimes,
              state.selectedTargetId,
              state.selectedRuntimeFilter,
              state.selectedRuntimeSelectionMode,
              e.type === "runtime.disconnected" ? undefined : runtimeId
            )
          };
        });
        break;

      case "event.batch":
        if (msg.runtimeId === HUB_RUNTIME_ID || msg.events.length === 0) {
          break;
        }
        set((state) => {
          const runtimeId = msg.runtimeId;
          const baseRuntime = ensureRuntime(state.runtimes, {
            runtimeId,
            platform:
              state.runtimes[runtimeId]?.platform ??
              state.runtimes[runtimeId]?.summary?.platform ??
              "unknown"
          });
          const batchEvents = msg.events.filter(
            (event) => event.runtimeId === runtimeId
          );
          if (batchEvents.length === 0) {
            return state;
          }
          const events = prependUniqueEvents(baseRuntime.events, batchEvents);
          if (events === baseRuntime.events) {
            return state;
          }
          const counts = countRuntimeEvents(events);
          const nextRuntime: RuntimeState = {
            ...baseRuntime,
            connected: true,
            events,
            ...counts,
            liveQueryVersion: baseRuntime.liveQueryVersion + 1,
            lastSubscriptionError: null
          };
          const runtimes = {
            ...state.runtimes,
            [runtimeId]: nextRuntime
          };
          return {
            runtimes,
            ...resolveSelectionState(
              runtimes,
              state.selectedTargetId,
              state.selectedRuntimeFilter,
              state.selectedRuntimeSelectionMode,
              runtimeId
            )
          };
        });
        break;

      case "command.result": {
        const pending = pendingRequests.get(msg.commandId);
        if (pending && pending.targetRuntimeId === msg.runtimeId) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.commandId);
          pending.resolve(msg.payload);
        }
        break;
      }

      case "subscription.data": {
        const subscription = subscriptions.get(msg.subscriptionId);
        if (!subscription) {
          break;
        }
        for (const listener of subscription.listeners) {
          listener(msg.payload);
        }

        set((state) => {
          const runtime = state.runtimes[msg.runtimeId];
          if (!runtime) {
            return state;
          }
          const nextRuntime = {
            ...runtime,
            liveQueryVersion: runtime.liveQueryVersion + 1,
            lastSubscriptionError: null
          };
          switch (msg.payload.kind) {
            case "runtime.summary.result":
              nextRuntime.summary = msg.payload.summary;
              nextRuntime.platform = msg.payload.summary.platform;
              if (msg.payload.summary.appName) {
                nextRuntime.appName = msg.payload.summary.appName;
              }
              if (msg.payload.summary.origin) {
                nextRuntime.origin = msg.payload.summary.origin;
              }
              if (msg.payload.summary.sessionLabel) {
                nextRuntime.sessionLabel = msg.payload.summary.sessionLabel;
              }
              if (msg.payload.summary.storageProtocol) {
                nextRuntime.storageProtocol = msg.payload.summary.storageProtocol;
              }
              if (msg.payload.summary.databaseLabel) {
                nextRuntime.databaseLabel = msg.payload.summary.databaseLabel;
              }
              if (msg.payload.summary.storageIdentity) {
                nextRuntime.storageIdentity = msg.payload.summary.storageIdentity;
              }
              break;
            case "runtime.activeQueries.result":
              nextRuntime.activeQueries = msg.payload.activeQueries;
              break;
          }
          return {
            runtimes: {
              ...state.runtimes,
              [msg.runtimeId]: nextRuntime
            }
          };
        });
        break;
      }

      case "subscription.error": {
        const subscription = subscriptions.get(msg.subscriptionId);
        if (!subscription || subscription.runtimeId !== msg.runtimeId) {
          break;
        }
        for (const listener of subscription.errorListeners) {
          listener(msg.error);
        }
        set((state) => {
          const runtime = state.runtimes[msg.runtimeId];
          if (!runtime) {
            return state;
          }
          return {
            runtimes: {
              ...state.runtimes,
              [msg.runtimeId]: {
                ...runtime,
                lastSubscriptionError: msg.error
              }
            }
          };
        });
        break;
      }
    }
  },

  clearEvents: (runtimeId) =>
    set((state) => {
      const targetRuntimeId = runtimeId ?? state.selectedRuntimeId;
      if (!targetRuntimeId || !state.runtimes[targetRuntimeId]) {
        return state;
      }
      return {
        runtimes: {
          ...state.runtimes,
          [targetRuntimeId]: {
            ...state.runtimes[targetRuntimeId],
            events: [],
            queryCount: 0,
            mutationCount: 0,
            actionCount: 0,
            errorCount: 0
          }
        }
      };
    })
}));

export function useActiveRuntime() {
  return useDevtoolsStore((state) => getActiveRuntime(state));
}

export function useRuntimeList() {
  return useDevtoolsStore(useShallow((state) => sortRuntimes(state.runtimes)));
}

export function useConnectedTargets() {
  return useDevtoolsStore(
    useShallow((state) =>
      getTargetsSnapshot(state.runtimes).filter((target) => target.connected)
    )
  );
}

export function useSelectedTarget() {
  return useDevtoolsStore((state) => {
    if (!state.selectedTargetId) {
      return null;
    }
    return getTargetsSnapshot(state.runtimes).find(
      (target) => target.id === state.selectedTargetId
    ) ?? null;
  });
}

export function useSelectedTargetRuntimes() {
  return useDevtoolsStore(
    useShallow((state) => {
      if (!state.selectedTargetId) {
        return [];
      }
      return (
        getTargetsSnapshot(state.runtimes).find(
          (target) => target.id === state.selectedTargetId
        )
          ?.runtimes.filter((runtime) => runtime.connected) ?? []
      );
    })
  );
}

export function useSelectedRuntimeFilter() {
  return useDevtoolsStore((state) => state.selectedRuntimeFilter);
}

export function useConnectedRuntimes() {
  return useDevtoolsStore(
    useShallow((state) =>
      sortRuntimes(state.runtimes).filter(
        (runtime) => runtime.connected && !isProjectRuntime(runtime)
      )
    )
  );
}

export function useConnectedRuntimeCount() {
  return useDevtoolsStore(
    (state) =>
      Object.values(state.runtimes).filter((runtime) => runtime.connected)
        .length
  );
}

export function useBestConnectedRuntime() {
  return useDevtoolsStore(
    (state) =>
      sortRuntimes(state.runtimes).find(
        (runtime) => runtime.connected && !isProjectRuntime(runtime)
      ) ?? null
  );
}

export function useProjectTargetRuntime() {
  return useDevtoolsStore(
    (state) =>
      sortRuntimes(state.runtimes).find(
        (runtime) => runtime.connected && isProjectRuntime(runtime)
      ) ?? null
  );
}

export function useSelectedRuntimeConnected(): boolean {
  return useDevtoolsStore<boolean>((state): boolean => {
    if (!state.selectedRuntimeId) {
      return false;
    }
    return state.runtimes[state.selectedRuntimeId]?.connected === true;
  });
}

export function useSelectedTargetEvents(): SyncoreDevtoolsEvent[] {
  return useDevtoolsStore(
    useShallow((state) => {
      if (!state.selectedTargetId) {
        return [];
      }
      const targets = getTargetsSnapshot(state.runtimes);
      const target = targets.find((entry) => entry.id === state.selectedTargetId);
      if (!target) {
        return [];
      }
      const runtimeIds =
        target.kind === "project" ||
        !state.selectedRuntimeFilter ||
        state.selectedRuntimeFilter === "all"
          ? new Set(target.runtimeIds)
          : new Set([state.selectedRuntimeFilter]);
      return target.runtimes
        .flatMap((runtime) =>
          runtimeIds.has(runtime.runtimeId) ? runtime.events : []
        )
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, MAX_EVENTS);
    })
  );
}

/* ------------------------------------------------------------------ */
/*  Request/Response infrastructure                                    */
/* ------------------------------------------------------------------ */

const pendingRequests = new Map<string, PendingRequest>();
const subscriptions = new Map<string, SubscriptionRecord>();
let requestCounter = 0;

function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

function sendSubscriptionRecord(record: SubscriptionRecord): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  const message: SyncoreDevtoolsClientMessage = {
    type: "subscribe",
    subscriptionId: record.subscriptionId,
    targetRuntimeId: record.runtimeId,
    payload: record.payload
  };
  debugLog("subscribe", "[dashboard] subscribe", {
    subscriptionId: record.subscriptionId,
    targetRuntimeId: record.runtimeId,
    payload: record.payload
  });
  ws.send(JSON.stringify(message));
  record.sent = true;
  return true;
}

function flushSubscriptions(runtimeId?: string) {
  for (const record of subscriptions.values()) {
    if (runtimeId && record.runtimeId !== runtimeId) {
      continue;
    }
    if (record.sent) {
      continue;
    }
    sendSubscriptionRecord(record);
  }
}

/**
 * Send a request to the runtime and wait for a response.
 * Returns a typed response payload, or throws on timeout/error.
 */
export function sendRequest(
  payload: SyncoreDevtoolsCommandPayload,
  options?: { targetRuntimeId?: string | null }
): Promise<SyncoreDevtoolsCommandResultPayload> {
  return new Promise((resolve, reject) => {
    const state = useDevtoolsStore.getState();
    const targetRuntimeId = options?.targetRuntimeId ?? state.selectedRuntimeId;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected to devtools hub"));
      return;
    }
    if (!targetRuntimeId) {
      reject(new Error("No runtime selected"));
      return;
    }

    const commandId = generateRequestId();
    const timer = setTimeout(() => {
      pendingRequests.delete(commandId);
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(commandId, {
      targetRuntimeId,
      resolve,
      reject,
      timer
    });

    const request: SyncoreDevtoolsClientMessage = {
      type: "command",
      commandId,
      targetRuntimeId,
      payload
    };

    debugLog("send-command", "[dashboard] send command", {
      commandId,
      targetRuntimeId,
      payload
    });

    ws.send(JSON.stringify(request));
  });
}

/**
 * Typed request helper — sends a request and narrows the response type.
 */
export async function request<
  K extends SyncoreDevtoolsCommandResultPayload["kind"]
>(
  payload: SyncoreDevtoolsCommandPayload,
  options?: { targetRuntimeId?: string | null }
): Promise<Extract<SyncoreDevtoolsCommandResultPayload, { kind: K }>> {
  const response = await sendRequest(payload, options);
  if (response.kind === "error") {
    throw new Error((response as { kind: "error"; message: string }).message);
  }
  return response as Extract<SyncoreDevtoolsCommandResultPayload, { kind: K }>;
}

export function subscribe(
  payload: SyncoreDevtoolsSubscriptionPayload,
  listener: (payload: SyncoreDevtoolsSubscriptionResultPayload) => void,
  options?: {
    onError?: (message: string) => void;
    targetRuntimeId?: string | null;
  }
): () => void {
  const state = useDevtoolsStore.getState();
  const targetRuntimeId = options?.targetRuntimeId ?? state.selectedRuntimeId;
  if (!targetRuntimeId) {
    return () => {};
  }

  const subscriptionId = generateRequestId();
  const record: SubscriptionRecord = {
    subscriptionId,
    runtimeId: targetRuntimeId,
    listeners: new Set([listener]),
    errorListeners: new Set(options?.onError ? [options.onError] : []),
    payload,
    sent: false
  };
  subscriptions.set(subscriptionId, record);
  sendSubscriptionRecord(record);

  return () => {
    const current = subscriptions.get(subscriptionId);
    subscriptions.delete(subscriptionId);
    if (ws?.readyState === WebSocket.OPEN) {
      const unsubscribeMessage: SyncoreDevtoolsClientMessage = {
        type: "unsubscribe",
        subscriptionId,
        targetRuntimeId
      };
      if (current?.sent) {
        debugLog("unsubscribe", "[dashboard] unsubscribe", {
          subscriptionId,
          targetRuntimeId,
          payload
        });
        ws.send(JSON.stringify(unsubscribeMessage));
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/*  WebSocket connection (side-effect, not in store)                    */
/* ------------------------------------------------------------------ */

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let connectionStarted = false;
let connectionGeneration = 0;

function connect() {
  if (ws || !connectionStarted) return;
  const hubToken = useDevtoolsStore.getState().hubToken;
  if (!hubToken) {
    useDevtoolsStore.getState().requestHubToken();
    return;
  }

  const wsUrl = buildDevtoolsWebSocketUrl(hubToken);
  const socket = new WebSocket(wsUrl);
  const generation = ++connectionGeneration;
  ws = socket;

  socket.onopen = () => {
    if (socket !== ws || generation !== connectionGeneration) {
      socket.close();
      return;
    }
    debugLog("ws-open", "[dashboard] websocket open", { url: wsUrl });
    useDevtoolsStore.getState()._setConnected(true);
    useDevtoolsStore.setState({
      authRequired: false,
      authError: null
    });
    flushSubscriptions();
  };

  socket.onmessage = (e) => {
    if (socket !== ws || generation !== connectionGeneration) {
      return;
    }
    if (typeof e.data !== "string") return;
    try {
      const msg = JSON.parse(e.data) as SyncoreDevtoolsMessage;
      if (
        msg.type === "hello" ||
        msg.type === "subscription.data" ||
        msg.type === "subscription.error" ||
        msg.type === "command.result"
      ) {
        debugLog(`ws-message:${msg.type}`, "[dashboard] ws message", msg);
      }
      useDevtoolsStore.getState()._handleMessage(msg);
    } catch {
      /* ignore malformed messages */
    }
  };

  socket.onclose = (event) => {
    if (socket !== ws || generation !== connectionGeneration) {
      return;
    }
    ws = null;
    const unauthorized = event.code === 1008;
    debugLog("ws-close", "[dashboard] websocket close", {
      reconnecting: connectionStarted && !unauthorized
    });
    useDevtoolsStore.getState()._setConnected(false);
    useDevtoolsStore.getState()._markAllRuntimesDisconnected();
    // Reject all pending requests
    for (const [, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("WebSocket disconnected"));
    }
    pendingRequests.clear();
    for (const subscription of subscriptions.values()) {
      subscription.sent = false;
    }
    if (unauthorized) {
      useDevtoolsStore.getState().requestHubToken(
        "The devtools token was missing or invalid."
      );
      return;
    }
    if (connectionStarted) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    if (socket !== ws || generation !== connectionGeneration) {
      return;
    }
    socket.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_DELAY);
}

function reconnectWithLatestToken() {
  if (!connectionStarted) {
    return;
  }
  connectionGeneration += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    const current = ws;
    ws = null;
    current.close();
  }
  connect();
}

/** Start the WebSocket connection. Call once at app boot. */
export function initDevtoolsConnection() {
  connectionStarted = true;
  connect();
}

/** Tear down the WebSocket connection. */
export function destroyDevtoolsConnection() {
  connectionStarted = false;
  connectionGeneration += 1;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}

