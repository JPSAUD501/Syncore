import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { SyncoreProvider } from "@syncore/react";
import {
  createSyncoreWebWorkerClient,
  type CreateWebWorkerClientProviderOptions,
  type ManagedWebWorkerClient
} from "./worker.js";

/**
 * Props for {@link SyncoreWebProvider}.
 */
export interface SyncoreWebProviderProps extends CreateWebWorkerClientProviderOptions {
  /** The React subtree that should receive the Syncore client. */
  children: ReactNode;

  /** Optional fallback content rendered before the worker client is ready. */
  fallback?: ReactNode;
}

/**
 * Props for {@link SyncoreBrowserProvider}.
 */
export type SyncoreBrowserProviderProps = SyncoreWebProviderProps;

/**
 * Start a worker-backed Syncore client and provide it to React descendants.
 */
export function SyncoreWebProvider({
  children,
  workerUrl,
  workerType,
  workerName,
  fallback = null
}: SyncoreWebProviderProps): ReactNode {
  const [managedClient, setManagedClient] =
    useState<ManagedWebWorkerClient | null>(null);

  useEffect(() => {
    const nextClient = createSyncoreWebWorkerClient({
      workerUrl,
      ...(workerType ? { workerType } : {}),
      ...(workerName ? { workerName } : {})
    });
    setManagedClient(nextClient);

    return () => {
      nextClient.dispose();
      setManagedClient(null);
    };
  }, [workerName, workerType, workerUrl]);

  if (!managedClient) {
    return fallback;
  }

  return (
    <SyncoreProvider client={managedClient.client}>{children}</SyncoreProvider>
  );
}

/**
 * Start a worker-backed Syncore client and provide it to React descendants.
 */
export function SyncoreBrowserProvider(props: SyncoreBrowserProviderProps) {
  return <SyncoreWebProvider {...props} />;
}
