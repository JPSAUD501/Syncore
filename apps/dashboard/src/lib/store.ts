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

const MAX_EVENTS = 500;
const HUB_RUNTIME_ID = "syncore-dev-hub";
const WS_URL = "ws://127.0.0.1:4311";
const RECONNECT_DELAY = 2000;
const REQUEST_TIMEOUT = 10_000;

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
}

const EMPTY_RUNTIME_STATE = {
  events: [],
  summary: null,
  activeQueries: [],
  queryCount: 0,
  mutationCount: 0,
  actionCount: 0,
  errorCount: 0,
  liveQueryVersion: 0
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
  runtimeId: string;
  listeners: Set<(payload: SyncoreDevtoolsSubscriptionResultPayload) => void>;
  payload: SyncoreDevtoolsSubscriptionPayload;
}

interface DevtoolsState {
  connected: boolean;
  runtimes: Record<string, RuntimeState>;
  selectedRuntimeId: string | null;
  _handleMessage: (msg: SyncoreDevtoolsMessage) => void;
  _setConnected: (v: boolean) => void;
  selectRuntime: (runtimeId: string | null) => void;
  clearEvents: (runtimeId?: string) => void;
}

export interface ActiveRuntimeView extends RuntimeState {
  pendingJobs: Array<{
    id: string;
    functionName: string;
    runAt: number;
    status: string;
  }>;
}

function createRuntimeState(meta: RuntimeMeta): RuntimeState {
  return {
    ...meta,
    connected: true,
    ...EMPTY_RUNTIME_STATE
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

function getActiveRuntime(state: DevtoolsState): RuntimeState | null {
  const selectedRuntimeId = state.selectedRuntimeId;
  if (!selectedRuntimeId) {
    return null;
  }
  return state.runtimes[selectedRuntimeId] ?? null;
}

function toActiveRuntimeView(
  runtime: RuntimeState | null
): ActiveRuntimeView | null {
  if (!runtime) {
    return null;
  }
  return {
    ...runtime,
    pendingJobs: []
  };
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

  _setConnected: (v) =>
    set((state) => (state.connected === v ? state : { connected: v })),

  selectRuntime: (runtimeId) =>
    set((state) =>
      state.selectedRuntimeId === runtimeId
        ? state
        : { selectedRuntimeId: runtimeId }
    ),

  _handleMessage: (msg) => {
    switch (msg.type) {
      case "hello":
        if (msg.runtimeId === HUB_RUNTIME_ID) {
          break;
        }
        set((state) => {
          const nextRuntime = ensureRuntime(state.runtimes, {
            runtimeId: msg.runtimeId,
            platform: msg.platform,
            ...(msg.appName ? { appName: msg.appName } : {}),
            ...(msg.origin ? { origin: msg.origin } : {}),
            ...(msg.sessionLabel ? { sessionLabel: msg.sessionLabel } : {})
          });
          return {
            runtimes: {
              ...state.runtimes,
              [msg.runtimeId]: nextRuntime
            },
            selectedRuntimeId: state.selectedRuntimeId ?? msg.runtimeId
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
          const events = [msg.event, ...baseRuntime.events].slice(
            0,
            MAX_EVENTS
          );
          const e = msg.event;
          const nextRuntime: RuntimeState = {
            ...baseRuntime,
            connected: msg.event.type === "runtime.disconnected" ? false : true,
            events,
            queryCount:
              baseRuntime.queryCount + (e.type === "query.executed" ? 1 : 0),
            mutationCount:
              baseRuntime.mutationCount +
              (e.type === "mutation.committed" ? 1 : 0),
            actionCount:
              baseRuntime.actionCount + (e.type === "action.completed" ? 1 : 0),
            errorCount:
              baseRuntime.errorCount +
              (e.type === "log" && e.level === "error" ? 1 : 0) +
              (e.type === "action.completed" && e.error ? 1 : 0),
            liveQueryVersion: baseRuntime.liveQueryVersion + 1
          };
          return {
            runtimes: {
              ...state.runtimes,
              [runtimeId]: nextRuntime
            },
            selectedRuntimeId: state.selectedRuntimeId ?? runtimeId
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
            liveQueryVersion: runtime.liveQueryVersion + 1
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
  return useDevtoolsStore((state) =>
    toActiveRuntimeView(getActiveRuntime(state))
  );
}

export function useRuntimeList() {
  return useDevtoolsStore(useShallow((state) => sortRuntimes(state.runtimes)));
}

export function useConnectedRuntimeCount() {
  return useDevtoolsStore(
    (state) =>
      Object.values(state.runtimes).filter((runtime) => runtime.connected)
        .length
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
  listener: (payload: SyncoreDevtoolsSubscriptionResultPayload) => void
): () => void {
  const state = useDevtoolsStore.getState();
  const targetRuntimeId = state.selectedRuntimeId;
  if (!ws || ws.readyState !== WebSocket.OPEN || !targetRuntimeId) {
    return () => {};
  }

  const subscriptionId = generateRequestId();
  subscriptions.set(subscriptionId, {
    runtimeId: targetRuntimeId,
    listeners: new Set([listener]),
    payload
  });

  const message: SyncoreDevtoolsClientMessage = {
    type: "subscribe",
    subscriptionId,
    targetRuntimeId,
    payload
  };
  ws.send(JSON.stringify(message));

  return () => {
    subscriptions.delete(subscriptionId);
    if (ws?.readyState === WebSocket.OPEN) {
      const unsubscribeMessage: SyncoreDevtoolsClientMessage = {
        type: "unsubscribe",
        subscriptionId,
        targetRuntimeId
      };
      ws.send(JSON.stringify(unsubscribeMessage));
    }
  };
}

/* ------------------------------------------------------------------ */
/*  WebSocket connection (side-effect, not in store)                    */
/* ------------------------------------------------------------------ */

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (ws) return;

  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    useDevtoolsStore.getState()._setConnected(true);
  };

  socket.onmessage = (e) => {
    if (typeof e.data !== "string") return;
    try {
      const msg = JSON.parse(e.data) as SyncoreDevtoolsMessage;
      useDevtoolsStore.getState()._handleMessage(msg);
    } catch {
      /* ignore malformed messages */
    }
  };

  socket.onclose = () => {
    ws = null;
    useDevtoolsStore.getState()._setConnected(false);
    // Reject all pending requests
    for (const [, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error("WebSocket disconnected"));
    }
    pendingRequests.clear();
    scheduleReconnect();
  };

  socket.onerror = () => {
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
  connect();
}

/** Tear down the WebSocket connection. */
export function destroyDevtoolsConnection() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    ws.close();
    ws = null;
  }
}
