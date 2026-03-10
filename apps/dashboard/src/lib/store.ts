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
  readDashboardActivityPreference,
  writeDashboardActivityPreference
} from "./activity";

const MAX_EVENTS = 500;
const HUB_RUNTIME_ID = "syncore-dev-hub";
const WS_URL = "ws://127.0.0.1:4311";
const RECONNECT_DELAY = 2000;
const REQUEST_TIMEOUT = 10_000;
const DEBUG_DEVTOOLS = false;
const debugCounters = new Map<string, number>();

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
  selectedRuntimeId: string | null;
  includeDashboardActivity: boolean;
  _handleMessage: (msg: SyncoreDevtoolsMessage) => void;
  _setConnected: (v: boolean) => void;
  _markAllRuntimesDisconnected: () => void;
  selectRuntime: (runtimeId: string | null) => void;
  setIncludeDashboardActivity: (value: boolean) => void;
  toggleIncludeDashboardActivity: () => void;
  clearEvents: (runtimeId?: string) => void;
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
    ...(meta.appName ? { appName: meta.appName } : {}),
    ...(meta.origin ? { origin: meta.origin } : {}),
    ...(meta.sessionLabel ? { sessionLabel: meta.sessionLabel } : {})
  };
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

function resolveSelectedRuntimeId(
  runtimes: Record<string, RuntimeState>,
  currentSelectedRuntimeId: string | null,
  preferredRuntimeId?: string
): string | null {
  if (currentSelectedRuntimeId && runtimes[currentSelectedRuntimeId]) {
    return currentSelectedRuntimeId;
  }
  if (preferredRuntimeId && runtimes[preferredRuntimeId]?.connected === true) {
    return preferredRuntimeId;
  }
  return (
    sortRuntimes(runtimes).find((runtime) => runtime.connected)?.runtimeId ??
    null
  );
}

function sortRuntimes(runtimes: Record<string, RuntimeState>): RuntimeState[] {
  return Object.values(runtimes).sort((a, b) => {
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
  selectedRuntimeId: null,
  includeDashboardActivity: readDashboardActivityPreference(),

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
      return changed ? { runtimes } : state;
    }),

  selectRuntime: (runtimeId) =>
    set((state) =>
      state.selectedRuntimeId === runtimeId
        ? state
        : { selectedRuntimeId: runtimeId }
    ),

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
            ...(msg.appName ? { appName: msg.appName } : {}),
            ...(msg.origin ? { origin: msg.origin } : {}),
            ...(msg.sessionLabel ? { sessionLabel: msg.sessionLabel } : {})
          });
          const runtimes = {
            ...state.runtimes,
            [msg.runtimeId]: nextRuntime
          };
          return {
            runtimes,
            selectedRuntimeId: resolveSelectedRuntimeId(
              runtimes,
              state.selectedRuntimeId,
              msg.runtimeId
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
            selectedRuntimeId: resolveSelectedRuntimeId(
              runtimes,
              state.selectedRuntimeId,
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
            selectedRuntimeId: resolveSelectedRuntimeId(
              runtimes,
              state.selectedRuntimeId,
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

export function useConnectedRuntimes() {
  return useDevtoolsStore(
    useShallow((state) =>
      sortRuntimes(state.runtimes).filter((runtime) => runtime.connected)
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
    (state) => sortRuntimes(state.runtimes).find((runtime) => runtime.connected) ?? null
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
  payload: SyncoreDevtoolsCommandPayload
): Promise<SyncoreDevtoolsCommandResultPayload> {
  return new Promise((resolve, reject) => {
    const state = useDevtoolsStore.getState();
    const targetRuntimeId = state.selectedRuntimeId;
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
  payload: SyncoreDevtoolsCommandPayload
): Promise<Extract<SyncoreDevtoolsCommandResultPayload, { kind: K }>> {
  const response = await sendRequest(payload);
  if (response.kind === "error") {
    throw new Error((response as { kind: "error"; message: string }).message);
  }
  return response as Extract<SyncoreDevtoolsCommandResultPayload, { kind: K }>;
}

export function subscribe(
  payload: SyncoreDevtoolsSubscriptionPayload,
  listener: (payload: SyncoreDevtoolsSubscriptionResultPayload) => void,
  options?: { onError?: (message: string) => void }
): () => void {
  const state = useDevtoolsStore.getState();
  const targetRuntimeId = state.selectedRuntimeId;
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

  const socket = new WebSocket(WS_URL);
  const generation = ++connectionGeneration;
  ws = socket;

  socket.onopen = () => {
    if (socket !== ws || generation !== connectionGeneration) {
      socket.close();
      return;
    }
    debugLog("ws-open", "[dashboard] websocket open", { url: WS_URL });
    useDevtoolsStore.getState()._setConnected(true);
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

  socket.onclose = () => {
    if (socket !== ws || generation !== connectionGeneration) {
      return;
    }
    ws = null;
    debugLog("ws-close", "[dashboard] websocket close", {
      reconnecting: connectionStarted
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
