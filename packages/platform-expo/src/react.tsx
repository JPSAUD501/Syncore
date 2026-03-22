import { createDeferredSyncoreClient } from "@syncore/core";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { SyncoreProvider } from "@syncore/react";
import type { SyncoreClient } from "@syncore/core";
import type { ExpoSyncoreBootstrap } from "./index.js";

type ExpoSyncoreClient = SyncoreClient;

/**
 * Props for {@link SyncoreExpoProvider}.
 */
export interface SyncoreExpoProviderProps {
  /** The bootstrap created with `createExpoSyncoreBootstrap`. */
  bootstrap: ExpoSyncoreBootstrap;

  /** The React subtree that should receive the Syncore client. */
  children: ReactNode;

  /** Optional fallback content rendered while the local runtime starts. */
  fallback?: ReactNode;
}

/**
 * Start an Expo Syncore bootstrap and provide its client to React descendants.
 */
export function SyncoreExpoProvider({
  bootstrap,
  children,
  fallback = null
}: SyncoreExpoProviderProps): ReactNode {
  const client = useMemo(
    () =>
      createDeferredSyncoreClient({
        loadClient: () => bootstrap.getClient(),
        initialStatus: {
          kind: "starting",
          reason: "booting"
        },
        failureReason: "runtime-unavailable"
      }) as ExpoSyncoreClient,
    [bootstrap]
  );

  useEffect(() => {
    return () => {
      void bootstrap.stop();
    };
  }, [bootstrap]);

  return <SyncoreProvider client={client}>{children ?? fallback}</SyncoreProvider>;
}
