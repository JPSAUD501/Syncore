import {
  generateId,
  type AnySyncoreSchema,
  type FunctionReference,
  type JsonObject,
  type SyncoreClient,
  type SyncoreRuntime,
  type SyncoreWatch
} from "@syncore/core";

export type NodeIpcSyncoreSchema = AnySyncoreSchema;

export interface SyncoreIpcMessageEndpoint {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
}

type SyncoreIpcRequest =
  | {
      type: "invoke";
      requestId: string;
      kind: "query";
      reference: FunctionReference<"query", unknown, unknown>;
      args: JsonObject;
    }
  | {
      type: "invoke";
      requestId: string;
      kind: "mutation";
      reference: FunctionReference<"mutation", unknown, unknown>;
      args: JsonObject;
    }
  | {
      type: "invoke";
      requestId: string;
      kind: "action";
      reference: FunctionReference<"action", unknown, unknown>;
      args: JsonObject;
    }
  | {
      type: "watch.subscribe";
      subscriptionId: string;
      reference: FunctionReference<"query", unknown, unknown>;
      args: JsonObject;
    }
  | {
      type: "watch.unsubscribe";
      subscriptionId: string;
    };

type SyncoreIpcResponse =
  | {
      type: "runtime.ready";
    }
  | {
      type: "runtime.error";
      error: string;
    }
  | {
      type: "invoke.result";
      requestId: string;
      success: true;
      value: unknown;
    }
  | {
      type: "invoke.result";
      requestId: string;
      success: false;
      error: string;
    }
  | {
      type: "watch.update";
      subscriptionId: string;
      success: true;
      value: unknown;
    }
  | {
      type: "watch.update";
      subscriptionId: string;
      success: false;
      error: string;
    };

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

interface WatchRecord {
  subscriptionId: string;
  listeners: Set<() => void>;
  consumers: number;
  result: unknown;
  error: Error | undefined;
}

export type RendererQueryWatch<TValue> = SyncoreWatch<TValue> & {
  dispose(): void;
};

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

export class SyncoreRendererClient implements SyncoreClient {
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly watchRecordsByKey = new Map<string, WatchRecord>();
  private readonly watchKeyBySubscriptionId = new Map<string, string>();
  private disposed = false;

  private readonly handleMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as SyncoreIpcResponse;
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    switch (message.type) {
      case "runtime.ready":
        return;
      case "runtime.error":
        this.rejectAllPending(new Error(message.error));
        return;
      case "invoke.result": {
        const pending = this.pendingRequests.get(message.requestId);
        if (!pending) {
          return;
        }
        this.pendingRequests.delete(message.requestId);
        if (message.success) {
          pending.resolve(message.value);
        } else {
          pending.reject(new Error(message.error));
        }
        return;
      }
      case "watch.update": {
        const watchKey = this.watchKeyBySubscriptionId.get(
          message.subscriptionId
        );
        if (!watchKey) {
          return;
        }
        const watchRecord = this.watchRecordsByKey.get(watchKey);
        if (!watchRecord) {
          return;
        }
        if (message.success) {
          watchRecord.result = message.value;
          watchRecord.error = undefined;
        } else {
          watchRecord.error = new Error(message.error);
        }
        for (const listener of watchRecord.listeners) {
          listener();
        }
      }
    }
  };

  constructor(private readonly endpoint: SyncoreIpcMessageEndpoint) {
    this.endpoint.addEventListener("message", this.handleMessage);
  }

  query<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult> {
    return this.invoke(
      "query",
      reference,
      normalizeOptionalArgs(args) as JsonObject
    );
  }

  mutation<TArgs, TResult>(
    reference: FunctionReference<"mutation", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult> {
    return this.invoke(
      "mutation",
      reference,
      normalizeOptionalArgs(args) as JsonObject
    );
  }

  action<TArgs, TResult>(
    reference: FunctionReference<"action", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult> {
    return this.invoke(
      "action",
      reference,
      normalizeOptionalArgs(args) as JsonObject
    );
  }

  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): RendererQueryWatch<TResult> {
    this.ensureNotDisposed();
    const normalizedArgs = normalizeOptionalArgs(args) as JsonObject;
    const watchKey = createWatchKey(reference, normalizedArgs);
    let watchRecord = this.watchRecordsByKey.get(watchKey);
    if (!watchRecord) {
      watchRecord = {
        subscriptionId: generateId(),
        listeners: new Set<() => void>(),
        consumers: 0,
        result: undefined,
        error: undefined
      };
      this.watchRecordsByKey.set(watchKey, watchRecord);
      this.watchKeyBySubscriptionId.set(watchRecord.subscriptionId, watchKey);
      this.endpoint.postMessage({
        type: "watch.subscribe",
        subscriptionId: watchRecord.subscriptionId,
        reference,
        args: normalizedArgs
      } satisfies SyncoreIpcRequest);
    }

    watchRecord.consumers += 1;
    let disposed = false;
    const ownedListeners = new Set<() => void>();

    return {
      onUpdate: (callback) => {
        watchRecord.listeners.add(callback);
        ownedListeners.add(callback);
        queueMicrotask(callback);
        return () => {
          watchRecord.listeners.delete(callback);
          ownedListeners.delete(callback);
        };
      },
      localQueryResult: () => watchRecord.result as TResult | undefined,
      localQueryError: () => watchRecord.error,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        for (const callback of ownedListeners) {
          watchRecord.listeners.delete(callback);
        }
        ownedListeners.clear();
        watchRecord.consumers = Math.max(0, watchRecord.consumers - 1);
        if (watchRecord.consumers > 0) {
          return;
        }
        this.endpoint.postMessage({
          type: "watch.unsubscribe",
          subscriptionId: watchRecord.subscriptionId
        } satisfies SyncoreIpcRequest);
        this.watchKeyBySubscriptionId.delete(watchRecord.subscriptionId);
        this.watchRecordsByKey.delete(watchKey);
      }
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.endpoint.removeEventListener("message", this.handleMessage);
    for (const watchRecord of this.watchRecordsByKey.values()) {
      this.endpoint.postMessage({
        type: "watch.unsubscribe",
        subscriptionId: watchRecord.subscriptionId
      } satisfies SyncoreIpcRequest);
    }
    this.watchKeyBySubscriptionId.clear();
    this.watchRecordsByKey.clear();
    this.rejectAllPending(new Error("Syncore renderer client was disposed."));
  }

  private invoke<TArgs, TResult>(
    kind: "query",
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject
  ): Promise<TResult>;
  private invoke<TArgs, TResult>(
    kind: "mutation",
    reference: FunctionReference<"mutation", TArgs, TResult>,
    args: JsonObject
  ): Promise<TResult>;
  private invoke<TArgs, TResult>(
    kind: "action",
    reference: FunctionReference<"action", TArgs, TResult>,
    args: JsonObject
  ): Promise<TResult>;
  private invoke<TArgs, TResult>(
    kind: "query" | "mutation" | "action",
    reference: FunctionReference<
      "query" | "mutation" | "action",
      TArgs,
      TResult
    >,
    args: JsonObject
  ): Promise<TResult> {
    this.ensureNotDisposed();
    const requestId = generateId();
    const promise = new Promise<TResult>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
    });

    switch (kind) {
      case "query":
      case "mutation":
      case "action":
        this.endpoint.postMessage(
          createInvokeRequest(requestId, kind, reference, args)
        );
        break;
    }

    return promise;
  }

  private rejectAllPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("Syncore renderer client was disposed.");
    }
  }
}

export interface AttachNodeIpcRuntimeOptions {
  endpoint: SyncoreIpcMessageEndpoint;
  createRuntime:
    | (() => Promise<SyncoreRuntime<NodeIpcSyncoreSchema>>)
    | (() => SyncoreRuntime<NodeIpcSyncoreSchema>);
}

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

export interface AttachedNodeIpcRuntime {
  ready: Promise<void>;
  dispose(): Promise<void>;
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
  const subscriptions = new Map<
    string,
    {
      watch: SyncoreWatch<unknown>;
      unsubscribe: () => void;
    }
  >();

  const runtimePromise = Promise.resolve(options.createRuntime()).then(
    async (runtime) => {
      await runtime.start();
      return runtime;
    }
  );

  const clientPromise = runtimePromise.then((runtime) =>
    runtime.createClient()
  );

  const ready = clientPromise
    .then(() => {
      options.endpoint.postMessage({
        type: "runtime.ready"
      } satisfies SyncoreIpcResponse);
    })
    .catch((error) => {
      options.endpoint.postMessage({
        type: "runtime.error",
        error: error instanceof Error ? error.message : String(error)
      } satisfies SyncoreIpcResponse);
      throw error;
    });

  const handleMessage = (event: MessageEvent<unknown>) => {
    void (async () => {
      const message = event.data as SyncoreIpcRequest;
      if (!message || typeof message !== "object" || !("type" in message)) {
        return;
      }

      try {
        const client = await clientPromise;
        switch (message.type) {
          case "invoke": {
            const value =
              message.kind === "query"
                ? await client.query(message.reference, message.args)
                : message.kind === "mutation"
                  ? await client.mutation(message.reference, message.args)
                  : await client.action(message.reference, message.args);
            options.endpoint.postMessage({
              type: "invoke.result",
              requestId: message.requestId,
              success: true,
              value
            } satisfies SyncoreIpcResponse);
            return;
          }
          case "watch.subscribe": {
            if (subscriptions.has(message.subscriptionId)) {
              return;
            }
            const watch = client.watchQuery(message.reference, message.args);
            const sendCurrentState = () => {
              const error = watch.localQueryError();
              if (error) {
                options.endpoint.postMessage({
                  type: "watch.update",
                  subscriptionId: message.subscriptionId,
                  success: false,
                  error: error.message
                } satisfies SyncoreIpcResponse);
                return;
              }
              options.endpoint.postMessage({
                type: "watch.update",
                subscriptionId: message.subscriptionId,
                success: true,
                value: watch.localQueryResult()
              } satisfies SyncoreIpcResponse);
            };
            const unsubscribe = watch.onUpdate(sendCurrentState);
            subscriptions.set(message.subscriptionId, { watch, unsubscribe });
            sendCurrentState();
            return;
          }
          case "watch.unsubscribe": {
            const subscription = subscriptions.get(message.subscriptionId);
            if (!subscription) {
              return;
            }
            subscription.unsubscribe();
            subscriptions.delete(message.subscriptionId);
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (message.type === "invoke") {
          options.endpoint.postMessage({
            type: "invoke.result",
            requestId: message.requestId,
            success: false,
            error: errorMessage
          } satisfies SyncoreIpcResponse);
        }
        if (message.type === "watch.subscribe") {
          options.endpoint.postMessage({
            type: "watch.update",
            subscriptionId: message.subscriptionId,
            success: false,
            error: errorMessage
          } satisfies SyncoreIpcResponse);
        }
      }
    })();
  };

  options.endpoint.addEventListener("message", handleMessage);

  return {
    ready,
    async dispose() {
      options.endpoint.removeEventListener("message", handleMessage);
      for (const subscription of subscriptions.values()) {
        subscription.unsubscribe();
      }
      subscriptions.clear();
      const runtime = await runtimePromise;
      await runtime.stop();
    }
  };
}

function createInvokeRequest(
  requestId: string,
  kind: "query" | "mutation" | "action",
  reference:
    | FunctionReference<"query", unknown, unknown>
    | FunctionReference<"mutation", unknown, unknown>
    | FunctionReference<"action", unknown, unknown>,
  args: JsonObject
): SyncoreIpcRequest {
  switch (kind) {
    case "query":
      return {
        type: "invoke",
        requestId,
        kind,
        reference: reference as FunctionReference<"query">,
        args
      };
    case "mutation":
      return {
        type: "invoke",
        requestId,
        kind,
        reference: reference as FunctionReference<"mutation">,
        args
      };
    case "action":
      return {
        type: "invoke",
        requestId,
        kind,
        reference: reference as FunctionReference<"action">,
        args
      };
  }
}

function createWatchKey(
  reference: FunctionReference<"query", unknown, unknown>,
  args: JsonObject
): string {
  return `${reference.name}:${stableStringify(args)}`;
}

function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)])
    );
  }
  return value;
}
