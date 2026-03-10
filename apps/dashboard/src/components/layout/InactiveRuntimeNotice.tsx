import { AlertCircle, ArrowRight } from "lucide-react";
import {
  useActiveRuntime,
  useBestConnectedRuntime,
  useDevtoolsStore,
  useSelectedRuntimeConnected
} from "@/lib/store";
import { Button } from "@/components/ui/button";

function getRuntimeLabel(runtime: {
  sessionLabel?: string;
  appName?: string;
  platform: string;
}) {
  return runtime.sessionLabel ?? runtime.appName ?? runtime.platform;
}

export function InactiveRuntimeNotice() {
  const hubConnected = useDevtoolsStore((state) => state.connected);
  const selectRuntime = useDevtoolsStore((state) => state.selectRuntime);
  const activeRuntime = useActiveRuntime();
  const runtimeConnected = useSelectedRuntimeConnected();
  const bestConnectedRuntime = useBestConnectedRuntime();

  if (!hubConnected || !activeRuntime || runtimeConnected) {
    return null;
  }

  const selectedLabel = getRuntimeLabel(activeRuntime);
  const switchTarget =
    bestConnectedRuntime &&
    bestConnectedRuntime.runtimeId !== activeRuntime.runtimeId
      ? bestConnectedRuntime
      : null;

  return (
    <div className="fixed right-4 bottom-4 z-[70] w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-warning/25 bg-bg-surface/95 px-4 py-3 shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex items-start gap-3">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-text-primary">
            Selected runtime is inactive
          </p>
          <p className="mt-0.5 text-[11px] text-text-secondary">
            {selectedLabel} is no longer active.
          </p>
        </div>
        {switchTarget ? (
          <Button
            size="xs"
            className="gap-1 shrink-0"
            onClick={() => selectRuntime(switchTarget.runtimeId)}
          >
            Switch
            <ArrowRight size={11} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
