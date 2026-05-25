import {
  attachRuntimeBridge,
  type AttachRuntimeBridgeOptions,
  type AttachedRuntimeBridge,
  type BridgeQueryWatch,
  SyncoreBridgeClient,
  type SyncoreDataModel,
  type SyncoreBridgeMessageEndpoint,
} from "@syncore/core";

/**
 * Schema type constraint for worker-side Syncore runtimes.
 *
 * Pass any schema produced by `defineSchema()` where this type is expected.
 * Defaults to the unconstrained `SyncoreDataModel` when omitted.
 */
export type WebWorkerSyncoreSchema<
  TSchema extends SyncoreDataModel = SyncoreDataModel
> = TSchema;
/** Message endpoint shape required by the browser worker bridge (alias of `SyncoreBridgeMessageEndpoint`). */
export type SyncoreWorkerMessageEndpoint = SyncoreBridgeMessageEndpoint;
/** Live-query subscription handle returned by `SyncoreWebWorkerClient.watchQuery`. */
export type WorkerQueryWatch<TValue> = BridgeQueryWatch<TValue>;

/**
 * Syncore client that communicates with a runtime running in a browser Worker
 * over the `postMessage` bridge.
 *
 * Use `createSyncoreWebWorkerClient()` or `createManagedWebWorkerClient()` to
 * create instances. Prefer the React hooks (`useQuery`, `useMutation`, etc.)
 * over calling this directly in React apps.
 */
export class SyncoreWebWorkerClient extends SyncoreBridgeClient {
  declare query: SyncoreBridgeClient["query"];
  declare mutation: SyncoreBridgeClient["mutation"];
  declare action: SyncoreBridgeClient["action"];
  declare watchQuery: SyncoreBridgeClient["watchQuery"];
}

/** Options for attaching a runtime to a worker bridge endpoint. Alias of `AttachRuntimeBridgeOptions`. */
export type AttachWebWorkerRuntimeOptions<
  TSchema extends WebWorkerSyncoreSchema = WebWorkerSyncoreSchema
> = AttachRuntimeBridgeOptions<TSchema>;
/** Handle returned by `attachWebWorkerRuntime` for controlling the attached bridge. */
export type AttachedWebWorkerRuntime = AttachedRuntimeBridge;

/**
 * A browser Worker and its associated Syncore client, bundled for easy
 * lifecycle management.
 *
 * Returned by `createSyncoreWebWorkerClient` and `createManagedWebWorkerClient`.
 * Call `dispose()` to terminate the worker and release its resources.
 */
export interface ManagedWebWorkerClient {
  /** The Syncore client connected to the worker. */
  client: SyncoreWebWorkerClient;
  /** The underlying `Worker` instance. Useful for low-level control. */
  worker: Worker;
  /** Terminate the worker and dispose the client. Call on app unmount or navigation. */
  dispose(): void;
}

/**
 * Options for creating a managed worker Syncore client via
 * `createSyncoreWebWorkerClient`.
 */
export interface CreateWebWorkerClientProviderOptions {
  /** The worker module URL passed to `new Worker(...)`. Typically an `import.meta.url`-relative `URL`. */
  workerUrl: URL | string;
  /** Worker module type. Defaults to `"module"` (ESM worker). */
  workerType?: WorkerOptions["type"];
  /** Optional label shown in browser devtools’ Sources panel. */
  workerName?: string;
}

/**
 * Create a {@link SyncoreWebWorkerClient} from a low-level message endpoint.
 *
 * Use this when you already have a `Worker` or `MessagePort` reference and
 * want to wrap it manually. For the common case of spawning a new Worker from
 * a URL, use `createSyncoreWebWorkerClient` instead.
 */
export function createWebWorkerClient(
  endpoint: SyncoreWorkerMessageEndpoint
): SyncoreWebWorkerClient {
  return new SyncoreWebWorkerClient(endpoint);
}

/**
 * Create a {@link ManagedWebWorkerClient} using a provided Worker factory.
 *
 * Useful when you need control over how the Worker is constructed (e.g. to
 * pass constructor options not exposed by `CreateWebWorkerClientProviderOptions`).
 * For the common URL-based case, use `createSyncoreWebWorkerClient`.
 */
export function createManagedWebWorkerClient(options: {
  createWorker: () => Worker;
}): ManagedWebWorkerClient {
  const worker = options.createWorker();
  const client = createWebWorkerClient(worker);
  return {
    client,
    worker,
    dispose() {
      client.dispose();
      worker.terminate();
    }
  };
}

/**
 * Create a {@link ManagedWebWorkerClient} by spawning a new Worker from a URL.
 *
 * This is the standard way to create a main-thread client in a browser app.
 * Pass the URL of your `syncore.worker.ts` file (which calls
 * `createWebWorkerRuntime`) and connect the returned `client` to your React
 * `SyncoreProvider` or Svelte context.
 *
 * ```ts
 * // main.ts (or React root)
 * import { createSyncoreWebWorkerClient } from "syncorejs/browser";
 *
 * const { client, dispose } = createSyncoreWebWorkerClient({
 *   workerUrl: new URL("./syncore.worker.ts", import.meta.url),
 * });
 * ```
 */
export function createSyncoreWebWorkerClient(
  options: CreateWebWorkerClientProviderOptions
): ManagedWebWorkerClient {
  return createManagedWebWorkerClient({
    createWorker: () =>
      new Worker(options.workerUrl, {
        type: options.workerType ?? "module",
        ...(options.workerName ? { name: options.workerName } : {})
      })
  });
}

/**
 * Wire a Syncore runtime factory to a worker message endpoint.
 *
 * Called internally by `createWebWorkerRuntime`. Exposed for cases where you
 * need to attach a runtime to a custom bridge endpoint (e.g. a `MessagePort`).
 */
export function attachWebWorkerRuntime(
  options: AttachWebWorkerRuntimeOptions
): AttachedWebWorkerRuntime {
  return attachRuntimeBridge(options);
}
