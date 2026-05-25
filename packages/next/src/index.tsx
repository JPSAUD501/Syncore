import {
  createUnavailableSyncoreClient,
  type SyncoreClient
} from "@syncore/core";
import {
  createManagedWebWorkerClient,
  createSyncoreWebWorkerClient,
  type ManagedWebWorkerClient
} from "@syncore/platform-web";
import { SyncoreProvider } from "@syncore/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { getSyncoreWorkerUrl } from "./config.js";

export { getSyncoreWorkerUrl } from "./config.js";
export { createSyncoreNextWorkerUrl } from "./config.js";

/**
 * Shared configuration options for the Syncore Next.js integration.
 *
 * Accepted by both {@link SyncoreNextProvider} and
 * {@link registerSyncoreServiceWorker}.
 */
export interface SyncoreNextOptions {
  /**
   * URL of the Next PWA service worker. Defaults to `"/sw.js"` (the path
   * emitted by `next-pwa` or `@ducanh2912/next-pwa`).
   */
  serviceWorkerUrl?: string;

  /**
   * Public path to the compiled Syncore worker asset. Defaults to
   * `"/syncore.worker.js"`. Override if your build tool emits the worker to a
   * different path.
   */
  workerAssetUrl?: string;
}

/**
 * Handle returned by {@link registerSyncoreServiceWorker}.
 */
export interface SyncoreServiceWorkerRegistration {
  /** Unregister the installed service worker. */
  unregister(): Promise<boolean>;

  /**
   * Instruct the browser to check for a new service worker version. Useful
   * for implementing an “Update available” prompt.
   */
  update(): Promise<ServiceWorkerRegistration>;
}

/**
 * Register the Syncore PWA service worker in a Next.js app.
 *
 * Call this once at app startup (e.g. in your root layout’s `useEffect`, or in
 * `instrumentation.ts` with `"use client"`). Returns `null` on the server or
 * when the browser does not support service workers.
 *
 * ```ts
 * // app/layout.tsx (client component)
 * import { registerSyncoreServiceWorker } from "syncorejs/next";
 *
 * useEffect(() => {
 *   registerSyncoreServiceWorker({ serviceWorkerUrl: "/sw.js" });
 * }, []);
 * ```
 *
 * @param options - Optional configuration. Defaults to `"/sw.js"`.
 * @returns A {@link SyncoreServiceWorkerRegistration} handle, or `null` on
 *   the server / when unsupported.
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
 * Create a worker-backed Syncore client for a Next.js app.
 *
 * The client communicates with a Syncore runtime running inside a `Worker`.
 * The worker runs the SQLite engine and all function handlers off the main
 * thread so the UI stays responsive.
 *
 * In most cases you should use {@link SyncoreNextProvider} instead, which
 * manages the client lifecycle automatically. Use `createNextSyncoreClient`
 * directly only when you need to control the client lifecycle yourself (e.g.
 * in testing harnesses or custom providers).
 *
 * ```ts
 * const managedClient = createNextSyncoreClient({
 *   workerAssetUrl: "/syncore.worker.js",
 * });
 *
 * // Later:
 * managedClient.dispose();
 * ```
 */
export function createNextSyncoreClient(options: {
  /**
   * Custom worker factory function. Useful in tests (supply a `Worker` backed
   * by a mock or in-process runtime) or when using Next’s App Router dev-mode
   * bundling where `new Worker(new URL(...))` must be used inside the component.
   */
  createWorker?: () => Worker;

  /** Explicit module URL for an already-public worker script. */
  workerUrl?: URL | string;

  /** Public asset path for the compiled worker file. Defaults to `"/syncore.worker.js"`. */
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
 * React component that registers a PWA service worker as a side-effect.
 *
 * Renders its `children` immediately (no loading state) and registers the
 * service worker asynchronously. Safe to render on the server — the
 * registration effect only runs in browsers that support service workers.
 *
 * ```tsx
 * <SyncoreServiceWorker serviceWorkerUrl="/sw.js" onRegistered={console.log}>
 *   <App />
 * </SyncoreServiceWorker>
 * ```
 */
export function SyncoreServiceWorker({
  children,
  serviceWorkerUrl,
  onRegistered
}: {
  children: ReactNode;
  /** URL of the service worker script. Defaults to `"/sw.js"`. */
  serviceWorkerUrl?: string;
  /** Called after the service worker is successfully registered. */
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
 * Root provider that wires a worker-backed Syncore runtime into a Next.js
 * React tree.
 *
 * Place this at the top of your App Router layout. It spawns the Syncore
 * worker on mount, exposes the client via React context (accessible with
 * `useSyncore()`), and optionally registers the PWA service worker.
 *
 * ```tsx
 * // app/layout.tsx
 * import { SyncoreNextProvider } from "syncorejs/next";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <SyncoreNextProvider
 *           createWorker={() => new Worker(
 *             new URL("../syncore.worker.ts", import.meta.url)
 *           )}
 *         >
 *           {children}
 *         </SyncoreNextProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
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
   * Factory function that creates the Syncore `Worker`. Required in Next App
   * Router dev mode because `new Worker(new URL(..., import.meta.url))` must
   * be called inside the module to be bundled correctly.
   */
  createWorker?: () => Worker;

  /** URL of the PWA service worker script. Omit to skip service worker registration. */
  serviceWorkerUrl?: string;

  /** Explicit module URL for an already-public worker asset. */
  workerUrl?: URL | string;

  /** Public asset path for the compiled worker file. Defaults to `"/syncore.worker.js"`. */
  workerAssetUrl?: string;
}) {
  const createWorkerRef = useRef(createWorker);
  createWorkerRef.current = createWorker;
  const resolvedWorkerUrl =
    typeof workerUrl === "string" ? workerUrl : workerUrl?.toString();
  const bootingClient = useMemo(
    () =>
      createUnavailableSyncoreClient({
        kind: "starting",
        reason: "booting"
      }),
    []
  );
  const [client, setClient] = useState<SyncoreClient>(bootingClient);

  useEffect(() => {
    let disposed = false;
    let managedClient: ManagedWebWorkerClient | undefined;

    setClient(bootingClient);

    try {
      const workerFactory = createWorkerRef.current;
      managedClient = createNextSyncoreClient({
        ...(workerFactory
          ? {
              createWorker: () => workerFactory()
            }
          : {}),
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
      if (!disposed) {
        setClient(managedClient.client);
      }
    } catch (error) {
      if (!disposed) {
        setClient(
          createUnavailableSyncoreClient({
            kind: "unavailable",
            reason: "worker-unavailable",
            ...(error instanceof Error ? { error } : {})
          })
        );
      }
    }

    return () => {
      disposed = true;
      managedClient?.dispose();
    };
  }, [bootingClient, resolvedWorkerUrl, workerAssetUrl]);

  return (
    <SyncoreServiceWorker {...(serviceWorkerUrl ? { serviceWorkerUrl } : {})}>
      <SyncoreProvider client={client}>{children}</SyncoreProvider>
    </SyncoreServiceWorker>
  );
}
