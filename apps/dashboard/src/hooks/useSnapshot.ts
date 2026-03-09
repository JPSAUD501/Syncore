import { useDevtoolsStore } from "@/lib/store";
import type { SyncoreDevtoolsSnapshot } from "@syncore/devtools-protocol";

/**
 * Hook to access the latest runtime snapshot data.
 * Returns the snapshot and convenience accessors for sub-fields.
 */
export function useSnapshot() {
  const snapshot = useDevtoolsStore((s) => s.snapshot);

  return {
    snapshot,
    activeQueries: snapshot?.activeQueries ?? [],
    pendingJobs: snapshot?.pendingJobs ?? [],
    recentEvents: snapshot?.recentEvents ?? [],
    runtimeId: snapshot?.runtimeId ?? null,
    platform: snapshot?.platform ?? null,
    connectedAt: snapshot?.connectedAt ?? null,
    hasSnapshot: snapshot !== null
  };
}
