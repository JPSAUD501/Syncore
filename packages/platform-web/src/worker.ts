import {
  type AnySyncoreSchema,
  attachRuntimeBridge,
  type AttachRuntimeBridgeOptions,
  type AttachedRuntimeBridge,
  type BridgeQueryWatch,
  SyncoreBridgeClient,
  type SyncoreBridgeMessageEndpoint
} from "@syncore/core";

export type WebWorkerSyncoreSchema = AnySyncoreSchema;
export type SyncoreWorkerMessageEndpoint = SyncoreBridgeMessageEndpoint;
export type WorkerQueryWatch<TValue> = BridgeQueryWatch<TValue>;

export class SyncoreWebWorkerClient extends SyncoreBridgeClient {
  declare query: SyncoreBridgeClient["query"];
  declare mutation: SyncoreBridgeClient["mutation"];
  declare action: SyncoreBridgeClient["action"];
  declare watchQuery: SyncoreBridgeClient["watchQuery"];
}

export type AttachWebWorkerRuntimeOptions =
  AttachRuntimeBridgeOptions<WebWorkerSyncoreSchema>;
export type AttachedWebWorkerRuntime = AttachedRuntimeBridge;

/**
 * A worker-backed browser client plus the Worker instance it owns.
 */
export interface ManagedWebWorkerClient {
  client: SyncoreWebWorkerClient;
  worker: Worker;
  dispose(): void;
}

/**
 * Options for creating a worker-backed Syncore client in the browser.
 */
export interface CreateWebWorkerClientProviderOptions {
  /** The worker module URL passed to `new Worker(...)`. */
  workerUrl: URL | string;

  /** Optional worker type, defaults to `module`. */
  workerType?: WorkerOptions["type"];

  /** Optional name shown in browser devtools. */
  workerName?: string;
}

/**
 * Create a web worker Syncore client from a low-level message endpoint.
 */
export function createWebWorkerClient(
  endpoint: SyncoreWorkerMessageEndpoint
): SyncoreWebWorkerClient {
  return new SyncoreWebWorkerClient(endpoint);
}

/**
 * Create and manage both a browser Worker and the Syncore client that talks to it.
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
 * Create a worker-backed Syncore client using the standard Worker constructor.
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
 * Attach a Syncore runtime implementation to a worker message endpoint.
 */
export function attachWebWorkerRuntime(
  options: AttachWebWorkerRuntimeOptions
): AttachedWebWorkerRuntime {
  return attachRuntimeBridge(options);
}
