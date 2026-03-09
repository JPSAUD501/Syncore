import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { SyncoreProvider } from "@syncore/react";
import { createRendererSyncoreWindowClient } from "./ipc.js";

/**
 * Props for {@link SyncoreElectronProvider}.
 */
export interface SyncoreElectronProviderProps {
  /** The React subtree that should receive the renderer Syncore client. */
  children: ReactNode;

  /** Optional custom bridge name exposed on `window`. */
  bridgeName?: string;

  /** Optional window-like object for tests or custom shells. */
  windowObject?: Window & typeof globalThis;
}

/**
 * Create a renderer Syncore client from `window.syncoreBridge` and provide it to React.
 */
export function SyncoreElectronProvider({
  children,
  bridgeName,
  windowObject
}: SyncoreElectronProviderProps): ReactNode {
  const resolvedWindow = windowObject ?? window;
  const client = useMemo(
    () =>
      createRendererSyncoreWindowClient(
        resolvedWindow,
        bridgeName ?? "syncoreBridge"
      ),
    [bridgeName, resolvedWindow]
  );

  useEffect(() => () => client.dispose(), [client]);

  return <SyncoreProvider client={client}>{children}</SyncoreProvider>;
}
