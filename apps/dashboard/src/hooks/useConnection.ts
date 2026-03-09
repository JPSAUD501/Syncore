import { useDevtoolsStore } from "@/lib/store";

/**
 * Hook to access the connection state of the devtools WebSocket.
 */
export function useConnection() {
  const connected = useDevtoolsStore((s) => s.connected);
  const runtimeId = useDevtoolsStore((s) => s.runtimeId);
  const platform = useDevtoolsStore((s) => s.platform);

  return {
    connected,
    runtimeId,
    platform,
    isReady: connected && runtimeId !== null
  };
}
