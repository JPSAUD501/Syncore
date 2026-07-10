import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import {
  createUnavailableSyncoreClient,
  type SyncoreClient
} from "@syncore/core";
import { SyncoreProvider } from "@syncore/react";
import { createRendererSyncoreWindowClient } from "./ipc.js";

type DisposableSyncoreClient = SyncoreClient & {
  dispose?: () => void;
};

type RendererClientEntry = {
  client: DisposableSyncoreClient;
  consumers: number;
  disposeGeneration: number;
  disposed: boolean;
  dispose: () => void;
};

const rendererClients = new WeakMap<
  Window & typeof globalThis,
  Map<string, RendererClientEntry>
>();

function createRendererClient(
  windowObject: Window & typeof globalThis,
  bridgeName: string
): DisposableSyncoreClient {
  try {
    return createRendererSyncoreWindowClient(windowObject, bridgeName);
  } catch (error) {
    return createUnavailableSyncoreClient({
      kind: "unavailable",
      reason: "ipc-unavailable",
      capabilities: {
        storage: {
          available: false,
          reason: "Syncore IPC bridge is unavailable."
        }
      },
      ...(error instanceof Error ? { error } : {})
    });
  }
}

function getRendererClientEntry(
  windowObject: Window & typeof globalThis,
  bridgeName: string
): RendererClientEntry {
  let clientsForWindow = rendererClients.get(windowObject);
  if (!clientsForWindow) {
    clientsForWindow = new Map();
    rendererClients.set(windowObject, clientsForWindow);
  }

  const existing = clientsForWindow.get(bridgeName);
  if (existing && !existing.disposed) {
    return existing;
  }

  const entry: RendererClientEntry = {
    client: createRendererClient(windowObject, bridgeName),
    consumers: 0,
    disposeGeneration: 0,
    disposed: false,
    dispose: () => undefined
  };

  const handleBeforeUnload = () => entry.dispose();
  entry.dispose = () => {
    if (entry.disposed) {
      return;
    }
    entry.disposed = true;
    entry.disposeGeneration += 1;
    windowObject.removeEventListener?.("beforeunload", handleBeforeUnload);
    entry.client.dispose?.();
    if (clientsForWindow?.get(bridgeName) === entry) {
      clientsForWindow.delete(bridgeName);
    }
  };

  windowObject.addEventListener?.("beforeunload", handleBeforeUnload, {
    once: true
  });
  clientsForWindow.set(bridgeName, entry);
  return entry;
}

function retainRendererClient(entry: RendererClientEntry): () => void {
  entry.consumers += 1;
  entry.disposeGeneration += 1;

  return () => {
    entry.consumers = Math.max(0, entry.consumers - 1);
    const generation = ++entry.disposeGeneration;
    queueMicrotask(() => {
      if (
        !entry.disposed &&
        entry.consumers === 0 &&
        entry.disposeGeneration === generation
      ) {
        entry.dispose();
      }
    });
  };
}

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
  const entry = useMemo(
    () =>
      getRendererClientEntry(
        resolvedWindow,
        bridgeName ?? "syncoreBridge"
      ),
    [bridgeName, resolvedWindow]
  );

  useEffect(() => retainRendererClient(entry), [entry]);

  return <SyncoreProvider client={entry.client}>{children}</SyncoreProvider>;
}
