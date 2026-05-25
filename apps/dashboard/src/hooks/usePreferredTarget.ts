import {
  useActiveRuntime,
  useSelectedRuntimeFilter,
  useSelectedTarget,
  useSelectedRuntimeConnected
} from "@/lib/store";

interface PreferredTargetState {
  activeRuntime: ReturnType<typeof useActiveRuntime>;
  selectedTarget: ReturnType<typeof useSelectedTarget>;
  runtimeConnected: boolean;
  runtimeFilter: ReturnType<typeof useSelectedRuntimeFilter>;
  liveTargetId: string | null;
  projectTargetId: string | null;
  targetRuntimeId: string | null;
  selectedTargetId: string | null;
  supportsOffline: boolean;
  usingProjectTarget: boolean;
}

export function usePreferredTarget(): PreferredTargetState {
  const activeRuntime = useActiveRuntime();
  const selectedTarget = useSelectedTarget();
  const runtimeConnected = useSelectedRuntimeConnected();
  const runtimeFilter = useSelectedRuntimeFilter();
  const liveTargetId = activeRuntime?.runtimeId ?? null;
  const projectTargetId =
    activeRuntime?.targetKind === "project" ? activeRuntime.runtimeId : null;
  const targetRuntimeId = liveTargetId;
  const selectedTargetId = selectedTarget?.id ?? null;

  return {
    activeRuntime,
    selectedTarget,
    runtimeConnected,
    runtimeFilter,
    liveTargetId,
    projectTargetId,
    targetRuntimeId,
    selectedTargetId,
    supportsOffline: Boolean(projectTargetId),
    usingProjectTarget: activeRuntime?.targetKind === "project"
  };
}
