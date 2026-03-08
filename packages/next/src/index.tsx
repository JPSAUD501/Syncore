import {
  createManagedWebWorkerClient,
  type ManagedWebWorkerClient
} from "@syncore/platform-web";
import { SyncoreProvider } from "@syncore/react";
import { useEffect, useState, type ReactNode } from "react";

export interface SyncoreNextOptions {
  serviceWorkerUrl?: string;
  wasmAssetUrl?: string;
}
export interface SyncoreServiceWorkerRegistration {
  unregister(): Promise<boolean>;
  update(): Promise<ServiceWorkerRegistration>;
}

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

export function resolveSqlJsWasmUrl(options?: SyncoreNextOptions): string {
  return options?.wasmAssetUrl ?? "/sql-wasm.wasm";
}

export function createNextSyncoreClient(options: {
  createWorker: () => Worker;
}): ManagedWebWorkerClient {
  return createManagedWebWorkerClient({
    createWorker: options.createWorker
  });
}

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

export function SyncoreNextProvider({
  children,
  createWorker,
  serviceWorkerUrl
}: {
  children: ReactNode;
  createWorker: () => Worker;
  serviceWorkerUrl?: string;
}) {
  const [managedClient, setManagedClient] = useState<ManagedWebWorkerClient | null>(null);

  useEffect(() => {
    const nextClient = createNextSyncoreClient({ createWorker });
    setManagedClient(nextClient);

    return () => {
      nextClient.dispose();
      setManagedClient(null);
    };
  }, [createWorker]);

  if (!managedClient) {
    return null;
  }

  return (
    <SyncoreServiceWorker
      {...(serviceWorkerUrl ? { serviceWorkerUrl } : {})}
    >
      <SyncoreProvider client={managedClient.client}>{children}</SyncoreProvider>
    </SyncoreServiceWorker>
  );
}
