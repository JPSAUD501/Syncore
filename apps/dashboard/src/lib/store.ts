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
const WS_URL = "ws://127.0.0.1:4311";
const RECONNECT_DELAY = 2000;
const REQUEST_TIMEOUT = 10_000;

/* ------------------------------------------------------------------ */
/*  Store types                                                        */
/* ------------------------------------------------------------------ */

interface PendingRequest {
  resolve: (payload: SyncoreResponsePayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface DevtoolsState {
  /* connection */
  connected: boolean;
  runtimeId: string | null;
  platform: string | null;

  /* data */
  events: SyncoreDevtoolsEvent[];
  snapshot: SyncoreDevtoolsSnapshot | null;

  /* computed helpers */
  queryCount: number;
  mutationCount: number;
  actionCount: number;
  errorCount: number;

  /* actions */
  _handleMessage: (msg: SyncoreDevtoolsMessage) => void;
  _setConnected: (v: boolean) => void;
  clearEvents: () => void;
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useDevtoolsStore = create<DevtoolsState>((set) => ({
  connected: false,
  runtimeId: null,
  platform: null,
  events: [],
  snapshot: null,
  queryCount: 0,
  mutationCount: 0,
  actionCount: 0,
  errorCount: 0,

  _setConnected: (v) =>
    set({
      connected: v,
      ...(v ? {} : { runtimeId: null, platform: null })
    }),

  _handleMessage: (msg) => {
    switch (msg.type) {
      case "hello":
        set({ runtimeId: msg.runtimeId, platform: msg.platform });
        break;

      case "snapshot":
        set({
          snapshot: msg.snapshot,
          runtimeId: msg.snapshot.runtimeId,
          platform: msg.snapshot.platform
        });
        break;

      case "event":
        set((state) => {
          const events = [msg.event, ...state.events].slice(0, MAX_EVENTS);
          const e = msg.event;
          return {
            events,
            queryCount:
              state.queryCount + (e.type === "query.executed" ? 1 : 0),
            mutationCount:
              state.mutationCount + (e.type === "mutation.committed" ? 1 : 0),
            actionCount:
              state.actionCount + (e.type === "action.completed" ? 1 : 0),
            errorCount:
              state.errorCount +
              (e.type === "log" && e.level === "error" ? 1 : 0) +
              (e.type === "action.completed" && e.error ? 1 : 0)
          };
        });
        break;

      case "response": {
        const pending = pendingRequests.get(msg.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          pendingRequests.delete(msg.requestId);
          pending.resolve(msg.payload);
        }
        break;
      }
    }
  },

  clearEvents: () =>
    set({
      events: [],
      queryCount: 0,
      mutationCount: 0,
      actionCount: 0,
      errorCount: 0
    })
}));

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
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("Not connected to devtools hub"));
      return;
    }

    const requestId = generateRequestId();
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`Request timed out after ${REQUEST_TIMEOUT}ms`));
    }, REQUEST_TIMEOUT);

    pendingRequests.set(requestId, { resolve, reject, timer });

    const request: SyncoreDevtoolsRequest = {
      type: "request",
      requestId,
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
    for (const [id, pending] of pendingRequests) {
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
