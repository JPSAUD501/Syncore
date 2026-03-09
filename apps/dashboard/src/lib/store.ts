import { create } from "zustand";
import type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsMessage,
  SyncoreDevtoolsRequest,
  SyncoreDevtoolsSnapshot,
  SyncoreRequestPayload,
  SyncoreResponsePayload
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
  snapshot: SyncoreDevtoolsSnapshot | null;
  queryCount: number;
  mutationCount: number;
  actionCount: number;
  errorCount: number;
}

const EMPTY_RUNTIME_STATE = {
  events: [],
  snapshot: null,
  queryCount: 0,
  mutationCount: 0,
  actionCount: 0,
  errorCount: 0
} satisfies Pick<
  RuntimeState,
  | "events"
  | "snapshot"
  | "queryCount"
  | "mutationCount"
  | "actionCount"
  | "errorCount"
>;

/* ------------------------------------------------------------------ */
/*  Store types                                                        */
/* ------------------------------------------------------------------ */

interface PendingRequest {
  targetRuntimeId: string;
  resolve: (payload: SyncoreResponsePayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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

function sortRuntimes(runtimes: Record<string, RuntimeState>): RuntimeState[] {
  return Object.values(runtimes).sort((a, b) => {
    if (a.connected !== b.connected) {
      return a.connected ? -1 : 1;
    }
    const aLast = a.events[0]?.timestamp ?? a.snapshot?.connectedAt ?? 0;
    const bLast = b.events[0]?.timestamp ?? b.snapshot?.connectedAt ?? 0;
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

  _setConnected: (v) => set({ connected: v }),

  selectRuntime: (runtimeId) => set({ selectedRuntimeId: runtimeId }),

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

      case "snapshot":
        if (msg.snapshot.runtimeId === HUB_RUNTIME_ID) {
          break;
        }
        set((state) => {
          const runtimeId = msg.snapshot.runtimeId;
          const nextRuntime = ensureRuntime(state.runtimes, {
            runtimeId,
            platform: msg.snapshot.platform,
            ...(msg.snapshot.appName ? { appName: msg.snapshot.appName } : {}),
            ...(msg.snapshot.origin ? { origin: msg.snapshot.origin } : {}),
            ...(msg.snapshot.sessionLabel
              ? { sessionLabel: msg.snapshot.sessionLabel }
              : {})
          });
          nextRuntime.snapshot = msg.snapshot;
          return {
            runtimes: {
              ...state.runtimes,
              [runtimeId]: nextRuntime
            },
            selectedRuntimeId: state.selectedRuntimeId ?? runtimeId
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
              state.runtimes[runtimeId]?.snapshot?.platform ??
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
              (e.type === "action.completed" && e.error ? 1 : 0)
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

      case "response": {
        const pending = pendingRequests.get(msg.requestId);
        if (pending && pending.targetRuntimeId === msg.runtimeId) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.requestId);
          pending.resolve(msg.payload);
        }
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
  return useDevtoolsStore((state) => sortRuntimes(state.runtimes));
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
let requestCounter = 0;

function generateRequestId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

/**
 * Send a request to the runtime and wait for a response.
 * Returns a typed response payload, or throws on timeout/error.
 */
export function sendRequest(
  payload: SyncoreRequestPayload
): Promise<SyncoreResponsePayload> {
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

    const requestId = generateRequestId();
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, {
      targetRuntimeId,
      resolve,
      reject,
      timer
    });

    const request: SyncoreDevtoolsRequest = {
      type: "request",
      requestId,
      targetRuntimeId,
      payload
    };

    ws.send(JSON.stringify(request));
  });
}

/**
 * Typed request helper — sends a request and narrows the response type.
 */
export async function request<K extends SyncoreResponsePayload["kind"]>(
  payload: SyncoreRequestPayload
): Promise<Extract<SyncoreResponsePayload, { kind: K }>> {
  const response = await sendRequest(payload);
  if (response.kind === "error") {
    throw new Error((response as { kind: "error"; message: string }).message);
  }
  return response as Extract<SyncoreResponsePayload, { kind: K }>;
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
