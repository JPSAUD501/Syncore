import {
  type AnySyncoreSchema,
  type SyncoreClient,
  type SyncoreRuntime,
  type JsonObject,
  type SyncoreRuntimeStatus,
  type SyncoreWatch
} from "./runtime/runtime.js";
import { generateId } from "./runtime/id.js";
import type { FunctionReference } from "./runtime/functions.js";
import { RuntimeStatusController } from "./runtime/internal/runtimeStatus.js";

export interface SyncoreBridgeMessageEndpoint {
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

export type SyncoreBridgeRequest =
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

export type SyncoreBridgeResponse =
  | { type: "runtime.ready" }
  | { type: "runtime.error"; error: string }
  | { type: "runtime.status"; status: SyncoreRuntimeStatus }
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

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
};

type WatchRecord = {
  subscriptionId: string;
  listeners: Set<() => void>;
  consumers: number;
  result: unknown;
  error: Error | undefined;
};

type OptionalArgsTuple<TArgs> =
  Record<never, never> extends TArgs ? [args?: TArgs] : [args: TArgs];

export type BridgeQueryWatch<TValue> = SyncoreWatch<TValue> & {
  dispose(): void;
};

export class SyncoreBridgeClient implements SyncoreClient {
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly watchRecordsByKey = new Map<string, WatchRecord>();
  private readonly watchKeyBySubscriptionId = new Map<string, string>();
  private readonly runtimeStatus = new RuntimeStatusController({
    kind: "starting",
    reason: "booting"
  });
  private disposed = false;

  private readonly handleMessage = (event: MessageEvent<unknown>) => {
    const message = event.data as SyncoreBridgeResponse;
    if (!message || typeof message !== "object" || !("type" in message)) {
      return;
    }

    switch (message.type) {
      case "runtime.ready":
        this.runtimeStatus.setStatus({
          kind: "ready"
        });
        return;
      case "runtime.error":
        this.runtimeStatus.setStatus({
          kind: "error",
          reason: "runtime-unavailable",
          error: new Error(message.error)
        });
        for (const watchRecord of this.watchRecordsByKey.values()) {
          for (const listener of watchRecord.listeners) {
            listener();
          }
        }
        this.rejectAllPending(new Error(message.error));
        return;
      case "runtime.status":
        this.runtimeStatus.setStatus(message.status);
        for (const watchRecord of this.watchRecordsByKey.values()) {
          for (const listener of watchRecord.listeners) {
            listener();
          }
        }
        if (message.status.error) {
          this.rejectAllPending(message.status.error);
        }
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

  constructor(private readonly endpoint: SyncoreBridgeMessageEndpoint) {
    this.endpoint.addEventListener("message", this.handleMessage);
  }

  query<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    ...args: OptionalArgsTuple<TArgs>
  ): Promise<TResult> {
    return this.invoke("query", reference, normalizeOptionalArgs(args) as JsonObject);
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
  ): BridgeQueryWatch<TResult> {
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
      } satisfies SyncoreBridgeRequest);
    }

    watchRecord.consumers += 1;
    let disposed = false;
    const ownedListeners = new Set<() => void>();

    return {
      onUpdate: (callback: () => void) => {
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
        } satisfies SyncoreBridgeRequest);
        this.watchKeyBySubscriptionId.delete(watchRecord.subscriptionId);
        this.watchRecordsByKey.delete(watchKey);
      }
    };
  }

  watchRuntimeStatus(): SyncoreWatch<SyncoreRuntimeStatus> {
    return this.runtimeStatus.watch();
  }

  dispose(errorMessage = "Syncore bridge client was disposed."): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.runtimeStatus.setStatus({
      kind: "unavailable",
      reason: "disposed",
      error: new Error(errorMessage)
    });
    this.endpoint.removeEventListener("message", this.handleMessage);
    for (const watchRecord of this.watchRecordsByKey.values()) {
      this.endpoint.postMessage({
        type: "watch.unsubscribe",
        subscriptionId: watchRecord.subscriptionId
      } satisfies SyncoreBridgeRequest);
    }
    this.watchKeyBySubscriptionId.clear();
    this.watchRecordsByKey.clear();
    this.rejectAllPending(new Error(errorMessage));
  }

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

    this.endpoint.postMessage(
      createInvokeRequest(requestId, kind, reference, args)
    );

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
      throw new Error("Syncore bridge client was disposed.");
    }
  }
}

export function createUnavailableSyncoreClient(
  status: SyncoreRuntimeStatus
): SyncoreClient {
  const runtimeStatus = new RuntimeStatusController(status);
  const error =
    status.error ??
    new Error(
      status.reason
        ? `Syncore client is unavailable (${status.reason}).`
        : "Syncore client is unavailable."
    );

  return {
    query: async () => Promise.reject(error),
    mutation: async () => Promise.reject(error),
    action: async () => Promise.reject(error),
    watchQuery: () => ({
      onUpdate: (callback) => {
        queueMicrotask(callback);
        return () => undefined;
      },
      localQueryResult: () => undefined,
      localQueryError: () => undefined
    }),
    watchRuntimeStatus: () => runtimeStatus.watch()
  };
}

export function createDeferredSyncoreClient(options: {
  loadClient: () => Promise<SyncoreClient>;
  initialStatus?: SyncoreRuntimeStatus;
  failureReason?: SyncoreRuntimeStatus["reason"];
}): SyncoreClient {
  const runtimeStatus = new RuntimeStatusController(
    options.initialStatus ?? {
      kind: "starting",
      reason: "booting"
    }
  );
  const resolvedFailureReason = options.failureReason ?? "runtime-unavailable";
  let currentClient: SyncoreClient | undefined;
  let detachStatusListener: (() => void) | undefined;

  const clientPromise = Promise.resolve()
    .then(() => options.loadClient())
    .then((client) => {
      currentClient = client;
      const statusWatch = client.watchRuntimeStatus();
      const syncStatus = () => {
        const nextStatus = statusWatch.localQueryResult();
        if (nextStatus) {
          runtimeStatus.setStatus(nextStatus);
        }
      };
      syncStatus();
      detachStatusListener = statusWatch.onUpdate(syncStatus);
      return client;
    })
    .catch((error) => {
      const resolvedError =
        error instanceof Error ? error : new Error(String(error));
      runtimeStatus.setStatus({
        kind: "error",
        reason: resolvedFailureReason,
        error: resolvedError
      });
      throw resolvedError;
    });

  const waitForClient = () => clientPromise;

  return {
    query: async (reference, ...args) =>
      waitForClient().then((client) => client.query(reference, ...args)),
    mutation: async (reference, ...args) =>
      waitForClient().then((client) => client.mutation(reference, ...args)),
    action: async (reference, ...args) =>
      waitForClient().then((client) => client.action(reference, ...args)),
    watchQuery(reference, ...args) {
      let innerWatch: SyncoreWatch<unknown> | undefined;
      let detachInner: (() => void) | undefined;
      let result: unknown;
      let error: Error | undefined;
      const listeners = new Set<() => void>();
      let disposed = false;

      const notify = () => {
        for (const listener of listeners) {
          listener();
        }
      };

      void waitForClient()
        .then((client) => {
          if (disposed) {
            return;
          }
          innerWatch = client.watchQuery(reference, ...args);
          const sync = () => {
            result = innerWatch?.localQueryResult();
            error = innerWatch?.localQueryError();
            notify();
          };
          sync();
          detachInner = innerWatch.onUpdate(sync);
        })
        .catch((nextError) => {
          error = undefined;
          notify();
        });

      return {
        onUpdate(callback) {
          listeners.add(callback);
          queueMicrotask(callback);
          return () => {
            listeners.delete(callback);
          };
        },
        localQueryResult: () => result as typeof reference.__result | undefined,
        localQueryError: () => error,
        dispose() {
          if (disposed) {
            return;
          }
          disposed = true;
          detachInner?.();
          innerWatch?.dispose?.();
          listeners.clear();
        }
      };
    },
    watchRuntimeStatus: () => runtimeStatus.watch()
  };
}

export interface AttachRuntimeBridgeOptions<TSchema extends AnySyncoreSchema> {
  endpoint: SyncoreBridgeMessageEndpoint;
  createRuntime:
    | (() => Promise<SyncoreRuntime<TSchema>>)
    | (() => SyncoreRuntime<TSchema>);
}

export interface AttachedRuntimeBridge {
  ready: Promise<void>;
  dispose(): Promise<void>;
}

export function attachRuntimeBridge<TSchema extends AnySyncoreSchema>(
  options: AttachRuntimeBridgeOptions<TSchema>
): AttachedRuntimeBridge {
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

  const clientPromise = runtimePromise.then((runtime) => runtime.createClient());

  const ready = clientPromise
    .then(() => {
      options.endpoint.postMessage({
        type: "runtime.status",
        status: {
          kind: "ready"
        }
      } satisfies SyncoreBridgeResponse);
      options.endpoint.postMessage({
        type: "runtime.ready"
      } satisfies SyncoreBridgeResponse);
    })
    .catch((error) => {
      options.endpoint.postMessage({
        type: "runtime.status",
        status: {
          kind: "error",
          reason: "runtime-unavailable",
          ...(error instanceof Error ? { error } : {})
        }
      } satisfies SyncoreBridgeResponse);
      options.endpoint.postMessage({
        type: "runtime.error",
        error: error instanceof Error ? error.message : String(error)
      } satisfies SyncoreBridgeResponse);
      throw error;
    });

  const handleMessage = (event: MessageEvent<unknown>) => {
    void (async () => {
      const message = event.data as SyncoreBridgeRequest;
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
            } satisfies SyncoreBridgeResponse);
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
                } satisfies SyncoreBridgeResponse);
                return;
              }
              options.endpoint.postMessage({
                type: "watch.update",
                subscriptionId: message.subscriptionId,
                success: true,
                value: watch.localQueryResult()
              } satisfies SyncoreBridgeResponse);
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
          } satisfies SyncoreBridgeResponse);
        }
        if (message.type === "watch.subscribe") {
          options.endpoint.postMessage({
            type: "watch.update",
            subscriptionId: message.subscriptionId,
            success: false,
            error: errorMessage
          } satisfies SyncoreBridgeResponse);
        }
      }
    })();
  };

  options.endpoint.addEventListener("message", handleMessage);
  options.endpoint.postMessage({
    type: "runtime.status",
    status: {
      kind: "starting",
      reason: "booting"
    }
  } satisfies SyncoreBridgeResponse);

  return {
    ready,
    async dispose() {
      options.endpoint.postMessage({
        type: "runtime.status",
        status: {
          kind: "unavailable",
          reason: "disposed"
        }
      } satisfies SyncoreBridgeResponse);
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

export function createInvokeRequest(
  requestId: string,
  kind: "query" | "mutation" | "action",
  reference:
    | FunctionReference<"query", unknown, unknown>
    | FunctionReference<"mutation", unknown, unknown>
    | FunctionReference<"action", unknown, unknown>,
  args: JsonObject
): SyncoreBridgeRequest {
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

export function createWatchKey(
  reference: FunctionReference<"query", unknown, unknown>,
  args: JsonObject
): string {
  return `${reference.name}:${stableStringify(args)}`;
}

export function normalizeOptionalArgs<TArgs>(
  args: [] | [TArgs] | readonly unknown[]
): TArgs {
  return (args[0] ?? {}) as TArgs;
}

export function stableStringify(value: unknown): string {
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
