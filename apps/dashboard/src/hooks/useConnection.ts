import {
  useActiveRuntime,
  useConnectedRuntimes,
  useRuntimeList,
  useSelectedRuntimeConnected,
  useDevtoolsStore
} from "@/lib/store";

/**
 * Hook to access the connection state of the devtools WebSocket.
 */
export function useConnection() {
  const connected = useDevtoolsStore((s) => s.connected);
  const activeRuntime = useActiveRuntime();
  const runtimeConnected = useSelectedRuntimeConnected();
  const runtimes = useRuntimeList();
  const connectedRuntimes = useConnectedRuntimes();

  return {
    connected,
    runtimeConnected,
    runtimeId: activeRuntime?.runtimeId ?? null,
    platform: activeRuntime?.platform ?? null,
    liveQueryVersion: activeRuntime?.liveQueryVersion ?? 0,
    runtimeCount: connectedRuntimes.length,
    selectedRuntimeCount: runtimes.length,
    isReady: connected && runtimeConnected
  };
}
