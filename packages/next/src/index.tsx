import {
  createManagedWebWorkerClient,
  createSyncoreWebWorkerClient,
  type ManagedWebWorkerClient
} from "@syncore/platform-web";
import { SyncoreProvider } from "@syncore/react";
import { useEffect, useState, type ReactNode } from "react";
import { getSyncoreWorkerUrl } from "./config.js";

export { getSyncoreWorkerUrl } from "./config.js";
export { createSyncoreNextWorkerUrl } from "./config.js";

export interface SyncoreNextOptions {
  /** Optional service worker URL used to cache the application shell. */
  serviceWorkerUrl?: string;

  /** Optional URL for the `sql.js` wasm asset. */
  wasmAssetUrl?: string;

  /** Optional URL for the worker asset used by the local Syncore runtime. */
  workerAssetUrl?: string;
}

/**
 * The result of registering the Syncore service worker in a Next app.
 */
export interface SyncoreServiceWorkerRegistration {
  /** Unregister the installed service worker. */
  unregister(): Promise<boolean>;

  /** Ask the browser to check for an updated service worker. */
  update(): Promise<ServiceWorkerRegistration>;
}

/**
 * Register the Syncore service worker used by the Next integration.
 */
export async function registerSyncoreServiceWorker(
  options?: SyncoreNextOptions
): Promise<SyncoreServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  const registration = await navigator.serviceWorker.register(
    options?.serviceWorkerUrl ?? "/sw.js"
  );

  return {
    unregister: () => registration.unregister(),
    update: () => registration.update()
  };
}

/**
 * Resolve the public URL used by SQL.js to load its wasm file in a Next app.
 */
export function resolveSqlJsWasmUrl(options?: SyncoreNextOptions): string {
  return options?.wasmAssetUrl ?? "/sql-wasm.wasm";
}

/**
 * Create a worker-backed Syncore client for a Next app.
 */
export function createNextSyncoreClient(options: {
  /**
   * Optional custom worker factory for tests or framework-specific worker
   * bundling patterns such as Next App Router development.
   */
  createWorker?: () => Worker;

  /** Optional explicit module URL for an already-public worker asset. */
  workerUrl?: URL | string;

  /** Optional public worker asset path for production builds. */
  workerAssetUrl?: string;
}): ManagedWebWorkerClient {
  if (options.createWorker) {
    return createManagedWebWorkerClient({
      createWorker: options.createWorker
    });
  }

  return createSyncoreWebWorkerClient({
    workerUrl:
      options.workerUrl ?? options.workerAssetUrl ?? "/syncore.worker.js"
  });
}

/**
 * Register a service worker while rendering a React subtree.
 */
export function SyncoreServiceWorker({
  children,
  serviceWorkerUrl,
  onRegistered
}: {
  children: ReactNode;
  serviceWorkerUrl?: string;
  onRegistered?: (registration: ServiceWorkerRegistration) => void;
}) {
  useEffect(() => {
    void (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
        return;
      }
      const registration = await navigator.serviceWorker.register(
        serviceWorkerUrl ?? "/sw.js"
      );
      onRegistered?.(registration);
    })();
  }, [onRegistered, serviceWorkerUrl]);

  return children;
}

/**
 * Provides a worker-backed Syncore client to a Next React tree.
 *
 * This is the shortest recommended integration for App Router pages that run
 * fully local in the browser.
 */
export function SyncoreNextProvider({
  children,
  createWorker,
  serviceWorkerUrl,
  workerUrl,
  workerAssetUrl
}: {
  /** The React subtree that should receive the Syncore client. */
  children: ReactNode;

  /**
   * Optional custom worker factory for tests or Next colocated worker modules.
   */
  createWorker?: () => Worker;

  /** Optional service worker URL used to cache the application shell. */
  serviceWorkerUrl?: string;

  /** Optional explicit module URL for an already-public worker asset. */
  workerUrl?: URL | string;

  /** Optional public worker asset path for production builds. */
  workerAssetUrl?: string;
}) {
  const [managedClient, setManagedClient] =
    useState<ManagedWebWorkerClient | null>(null);
  const resolvedWorkerUrl =
    typeof workerUrl === "string" ? workerUrl : workerUrl?.toString();

  useEffect(() => {
    const nextClient = createNextSyncoreClient({
      ...(createWorker ? { createWorker } : {}),
      ...(resolvedWorkerUrl
        ? {
            workerUrl:
              process.env.NODE_ENV === "production"
                ? getSyncoreWorkerUrl()
                : resolvedWorkerUrl
          }
        : {}),
      ...(workerAssetUrl ? { workerAssetUrl } : {})
    });
    setManagedClient(nextClient);

    return () => {
      nextClient.dispose();
      setManagedClient(null);
    };
  }, [createWorker, resolvedWorkerUrl, workerAssetUrl]);

  if (!managedClient) {
    return null;
  }

  return (
    <SyncoreServiceWorker {...(serviceWorkerUrl ? { serviceWorkerUrl } : {})}>
      <SyncoreProvider client={managedClient.client}>
        {children}
      </SyncoreProvider>
    </SyncoreServiceWorker>
  );
}
