import {
  useActiveRuntime,
  useSelectedRuntimeFilter,
  useSelectedTarget,
  useProjectTargetRuntime,
  useSelectedRuntimeConnected
} from "@/lib/store";

interface PreferredTargetState {
  activeRuntime: ReturnType<typeof useActiveRuntime>;
  selectedTarget: ReturnType<typeof useSelectedTarget>;
  projectTarget: ReturnType<typeof useProjectTargetRuntime>;
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
  const projectTarget = useProjectTargetRuntime();
  const runtimeConnected = useSelectedRuntimeConnected();
  const runtimeFilter = useSelectedRuntimeFilter();
  const liveTargetId = activeRuntime?.runtimeId ?? null;
  const projectTargetId = projectTarget?.runtimeId ?? null;
  const targetRuntimeId = liveTargetId ?? projectTargetId;
  const selectedTargetId = selectedTarget?.id ?? null;

  return {
    activeRuntime,
    selectedTarget,
    projectTarget,
    runtimeConnected,
    runtimeFilter,
    liveTargetId,
    projectTargetId,
    targetRuntimeId,
    selectedTargetId,
    supportsOffline: Boolean(projectTargetId),
    usingProjectTarget: selectedTarget?.kind === "project"
  };
}
