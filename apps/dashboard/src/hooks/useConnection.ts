import {
  useActiveRuntime,
  useRuntimeList,
  useDevtoolsStore
} from "@/lib/store";

/**
 * Hook to access the connection state of the devtools WebSocket.
 */
export function useConnection() {
  const connected = useDevtoolsStore((s) => s.connected);
  const activeRuntime = useActiveRuntime();
  const runtimes = useRuntimeList();

  return {
    connected,
    runtimeId: activeRuntime?.runtimeId ?? null,
    platform: activeRuntime?.platform ?? null,
    liveQueryVersion: activeRuntime?.liveQueryVersion ?? 0,
    runtimeCount: runtimes.length,
    isReady: connected && activeRuntime !== null
  };
}
