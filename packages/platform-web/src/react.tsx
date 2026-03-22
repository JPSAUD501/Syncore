import {
  createUnavailableSyncoreClient,
  type SyncoreClient
} from "@syncore/core";
import { useEffect, useMemo, useState } from "react";
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
      managedClient = createSyncoreWebWorkerClient({
        workerUrl,
        ...(workerType ? { workerType } : {}),
        ...(workerName ? { workerName } : {})
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
  }, [bootingClient, workerName, workerType, workerUrl]);

  return (
    <SyncoreProvider client={client}>
      {children ?? fallback}
    </SyncoreProvider>
  );
}

/**
 * Start a worker-backed Syncore client and provide it to React descendants.
 */
export function SyncoreBrowserProvider(props: SyncoreBrowserProviderProps) {
  return <SyncoreWebProvider {...props} />;
}
