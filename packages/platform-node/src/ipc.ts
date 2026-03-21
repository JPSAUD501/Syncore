import {
  type AnySyncoreSchema,
  attachRuntimeBridge,
  type AttachRuntimeBridgeOptions,
  type AttachedRuntimeBridge,
  type BridgeQueryWatch,
  SyncoreBridgeClient,
  type SyncoreBridgeMessageEndpoint
} from "@syncore/core";

export type NodeIpcSyncoreSchema = AnySyncoreSchema;
export type SyncoreIpcMessageEndpoint = SyncoreBridgeMessageEndpoint;
export type RendererQueryWatch<TValue> = BridgeQueryWatch<TValue>;

export class SyncoreRendererClient extends SyncoreBridgeClient {
  declare query: SyncoreBridgeClient["query"];
  declare mutation: SyncoreBridgeClient["mutation"];
  declare action: SyncoreBridgeClient["action"];
  declare watchQuery: SyncoreBridgeClient["watchQuery"];
}

export type AttachNodeIpcRuntimeOptions =
  AttachRuntimeBridgeOptions<NodeIpcSyncoreSchema>;
export type AttachedNodeIpcRuntime = AttachedRuntimeBridge;

export interface SyncoreRendererBridge {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): () => void;
}

export interface SyncoreWindowBridge {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): () => void;
}

export interface SyncoreMainProcessBridge {
  postMessage(message: unknown): void;
  onMessage(listener: (message: unknown) => void): () => void;
}

/**
 * Install the default Electron preload bridge used by Syncore renderer helpers.
 */
export function installSyncoreWindowBridge(options?: {
  bridgeName?: string;
}): string {
  return `(function(){const bridgeName=${JSON.stringify(options?.bridgeName ?? "syncoreBridge")};const {contextBridge,ipcRenderer}=require("electron");const channel="syncore:message";const listeners=new Map();contextBridge.exposeInMainWorld(bridgeName,{postMessage(message){ipcRenderer.send(channel,message);},onMessage(listener){const wrapped=(_event,payload)=>{listener(payload);};listeners.set(listener,wrapped);ipcRenderer.on(channel,wrapped);return()=>{ipcRenderer.off(channel,wrapped);listeners.delete(listener);};}});})();`;
}

/**
 * Create a renderer client from a low-level IPC message endpoint.
 */
export function createRendererSyncoreClient(
  endpoint: SyncoreIpcMessageEndpoint
): SyncoreRendererClient {
  return new SyncoreRendererClient(endpoint);
}

/**
 * Create a renderer client from a bridge object exposed by preload code.
 */
export function createRendererSyncoreBridgeClient(
  bridge: SyncoreRendererBridge
): SyncoreRendererClient {
  const listeners = new Map<
    (event: MessageEvent<unknown>) => void,
    () => void
  >();

  return createRendererSyncoreClient({
    postMessage(message) {
      bridge.postMessage(message);
    },
    addEventListener(_type, listener) {
      listeners.set(
        listener,
        bridge.onMessage((message) => {
          listener({ data: message } as MessageEvent<unknown>);
        })
      );
    },
    removeEventListener(_type, listener) {
      listeners.get(listener)?.();
      listeners.delete(listener);
    }
  });
}

/**
 * Create a renderer client from `window.syncoreBridge` or another named bridge.
 */
export function createRendererSyncoreWindowClient(
  windowObject: Window & typeof globalThis,
  bridgeName = "syncoreBridge"
): SyncoreRendererClient {
  const bridge = (
    windowObject as typeof windowObject & Record<string, unknown>
  )[bridgeName];
  if (!bridge || typeof bridge !== "object") {
    throw new Error(`Missing window.${bridgeName} bridge.`);
  }

  const candidate = bridge as SyncoreWindowBridge;
  if (
    typeof candidate.postMessage !== "function" ||
    typeof candidate.onMessage !== "function"
  ) {
    throw new Error(
      `window.${bridgeName} must expose postMessage() and onMessage().`
    );
  }

  return createRendererSyncoreBridgeClient(candidate);
}

export function createNodeIpcMessageEndpoint(
  bridge: SyncoreMainProcessBridge
): SyncoreIpcMessageEndpoint & { dispose(): void } {
  const listeners = new Map<
    (event: MessageEvent<unknown>) => void,
    () => void
  >();

  return {
    postMessage(message) {
      bridge.postMessage(message);
    },
    addEventListener(_type, listener) {
      listeners.set(
        listener,
        bridge.onMessage((message) => {
          listener({ data: message } as MessageEvent<unknown>);
        })
      );
    },
    removeEventListener(_type, listener) {
      listeners.get(listener)?.();
      listeners.delete(listener);
    },
    dispose() {
      for (const dispose of listeners.values()) {
        dispose();
      }
      listeners.clear();
    }
  };
}

export function attachNodeIpcRuntime(
  options: AttachNodeIpcRuntimeOptions
): AttachedNodeIpcRuntime {
  return attachRuntimeBridge(options);
}
