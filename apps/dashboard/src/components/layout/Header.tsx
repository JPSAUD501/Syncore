import { useRouterState } from "@tanstack/react-router";
import {
  getPublicRuntimeId,
  getPublicTargetDisplayId,
  getRuntimeBrowser,
  getRuntimeLabel,
  getStorageProtocolLabel,
  useActiveRuntime,
  useConnectedTargets,
  useDevtoolsStore,
  useProjectTargetRuntime,
  useSelectedRuntimeConnected,
  useSelectedRuntimeFilter,
  useSelectedTarget,
  useSelectedTargetRuntimes
} from "@/lib/store";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Menu,
  Settings,
  Wifi,
  WifiOff
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ROUTE_TITLES: Record<string, string> = {
  "/": "Overview",
  "/data": "Data Browser",
  "/functions": "Functions",
  "/queries": "Active Queries",
  "/logs": "Logs",
  "/scheduler": "Scheduler",
  "/sql": "SQL Console"
};

type SelectedTarget = NonNullable<ReturnType<typeof useSelectedTarget>>;
type SelectedRuntime = ReturnType<typeof useActiveRuntime>;

function getTargetDisplayParts(target: SelectedTarget) {
  return {
    name: target.label,
    protocol: getStorageProtocolLabel(target.storageProtocol),
    publicId: getPublicTargetDisplayId(target.id),
    technicalLabel: target.technicalLabel
  };
}

function getContextRuntimeLabel(
  runtime: SelectedRuntime,
  runtimeFilter: string | null,
  runtimes: ReturnType<typeof useSelectedTargetRuntimes>
): string {
  if (runtimeFilter === "all" && runtimes.length > 1) {
    return "All runtimes";
  }
  return runtime ? getRuntimeLabel(runtime) : "No runtime";
}

export function Header({
  onToggleSidebar
}: {
  onToggleSidebar?: (() => void) | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const connected = useDevtoolsStore((s) => s.connected);
  const selectTarget = useDevtoolsStore((s) => s.selectTarget);
  const selectRuntime = useDevtoolsStore((s) => s.selectRuntime);
  const selectRuntimeFilter = useDevtoolsStore((s) => s.selectRuntimeFilter);
  const includeDashboardActivity = useDevtoolsStore(
    (s) => s.includeDashboardActivity
  );
  const toggleIncludeDashboardActivity = useDevtoolsStore(
    (s) => s.toggleIncludeDashboardActivity
  );
  const activeRuntime = useActiveRuntime();
  const selectedTarget = useSelectedTarget();
  const selectedTargetRuntimes = useSelectedTargetRuntimes();
  const selectedRuntimeFilter = useSelectedRuntimeFilter();
  const runtimeConnected = useSelectedRuntimeConnected();
  const targets = useConnectedTargets();
  const projectTarget = useProjectTargetRuntime();
  const [contextOpen, setContextOpen] = useState(false);

  const title = ROUTE_TITLES[pathname] ?? "Dashboard";
  const supportsProjectFallback = [
    "/data",
    "/functions",
    "/queries",
    "/scheduler",
    "/sql"
  ].includes(pathname);
  const projectOffline =
    supportsProjectFallback && !runtimeConnected && projectTarget?.connected;
  const contextRuntimeLabel = getContextRuntimeLabel(
    activeRuntime,
    selectedRuntimeFilter,
    selectedTargetRuntimes
  );
  const searchableTargets = useMemo(
    () =>
      targets.map((target) => {
        const parts = getTargetDisplayParts(target);
        return {
          target,
          parts,
          search: [
            target.label,
            target.technicalLabel,
            target.databaseLabel,
            target.dataSourceAlias,
            parts.protocol,
            parts.publicId,
            ...target.runtimes.flatMap((runtime) => [
              getRuntimeLabel(runtime),
              getRuntimeBrowser(runtime),
              getPublicRuntimeId(
                runtime.runtimeId,
                target.runtimes.map((entry) => entry.runtimeId)
              )
            ])
          ]
            .filter((value): value is string => Boolean(value))
            .join(" ")
        };
      }),
    [targets]
  );

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-base px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        {onToggleSidebar && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleSidebar}
            className="md:hidden"
          >
            <Menu size={16} />
          </Button>
        )}
        <h1 className="truncate text-sm font-semibold text-text-primary">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        {targets.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setContextOpen(true)}
            className="max-w-[54vw] justify-start gap-2 px-2.5 sm:max-w-96"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                selectedTarget?.connected ? "bg-success" : "bg-text-tertiary/40"
              )}
            />
            <span className="min-w-0 truncate text-left text-[12px] font-medium text-text-primary">
              <span>{selectedTarget?.label ?? "Select data source"}</span>
              {selectedTarget?.kind === "client" && (
                <span className="text-text-tertiary">
                  {" / "}
                  {contextRuntimeLabel}
                </span>
              )}
            </span>
            {selectedTarget?.metadataIncomplete && (
              <AlertTriangle size={12} className="shrink-0 text-warning" />
            )}
            <ChevronDown size={13} className="shrink-0 text-text-tertiary" />
          </Button>
        ) : (
          <span className="hidden rounded-md border border-dashed border-border px-2.5 py-1 text-[11px] text-text-tertiary sm:flex">
            {connected ? "Waiting for app..." : "No app connected"}
          </span>
        )}

        {projectOffline && (
          <Badge variant="outline" className="hidden text-[10px] md:inline-flex">
            Project Offline
          </Badge>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              className="flex text-text-tertiary hover:text-text-primary"
              title="Settings"
            >
              <Settings size={14} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Settings</DialogTitle>
              <DialogDescription>
                Configure the dashboard interface and filtering behavior.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">
                    Hide dashboard events
                  </span>
                  <span className="text-[13px] text-text-tertiary">
                    Exclude activity originating from this dashboard from the
                    activity feed and metrics.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!includeDashboardActivity}
                  onClick={() => toggleIncludeDashboardActivity()}
                  className={cn(
                    "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-not-allowed disabled:opacity-50",
                    !includeDashboardActivity ? "bg-accent" : "bg-bg-elevated"
                  )}
                >
                  <span
                    data-state={
                      !includeDashboardActivity ? "checked" : "unchecked"
                    }
                    className={cn(
                      "pointer-events-none block size-4 rounded-full bg-white ring-0 transition-transform",
                      !includeDashboardActivity
                        ? "translate-x-4"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Badge
          variant={connected ? "success" : "destructive"}
          className={cn("gap-1.5", connected && "animate-fade-in")}
        >
          {connected ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span className="hidden sm:inline">
            {connected ? "Live" : "Offline"}
          </span>
        </Badge>
      </div>

      <ContextSwitcherDialog
        open={contextOpen}
        onOpenChange={setContextOpen}
        searchableTargets={searchableTargets}
        selectedTarget={selectedTarget}
        selectedRuntimeFilter={selectedRuntimeFilter}
        selectTarget={selectTarget}
        selectRuntime={selectRuntime}
        selectRuntimeFilter={selectRuntimeFilter}
      />
    </header>
  );
}

function ContextSwitcherDialog({
  open,
  onOpenChange,
  searchableTargets,
  selectedTarget,
  selectedRuntimeFilter,
  selectTarget,
  selectRuntime,
  selectRuntimeFilter
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchableTargets: Array<{
    target: SelectedTarget;
    parts: ReturnType<typeof getTargetDisplayParts>;
    search: string;
  }>;
  selectedTarget: SelectedTarget | null;
  selectedRuntimeFilter: string | null;
  selectTarget: (targetId: string | null) => void;
  selectRuntime: (runtimeId: string | null) => void;
  selectRuntimeFilter: (runtimeId: string | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-[min(860px,calc(100vw-2rem))] overflow-hidden rounded-xl border-border/60 p-0 shadow-2xl shadow-black/50 sm:max-w-none"
      >
        <DialogTitle className="sr-only">Switch context</DialogTitle>
        <DialogDescription className="sr-only">
          Select a data source and runtime.
        </DialogDescription>
        <Command className="h-full w-full overflow-hidden rounded-none bg-bg-surface text-text-primary **:data-[slot=command-input-wrapper]:h-13">
          <CommandInput placeholder="Search data sources, runtimes, ids..." />
          <CommandList className="max-h-[65vh] scroll-py-1 p-3">
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup
              heading="Data Sources"
              className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-text-tertiary/50"
            >
              {searchableTargets.map(({ target, parts, search }) => {
                const selected = target.id === selectedTarget?.id;
                return (
                  <CommandItem
                    key={target.id}
                    value={`target:${target.id}:${search}`}
                    onSelect={() => {
                      selectTarget(target.id);
                      onOpenChange(false);
                    }}
                    className="items-start gap-3 rounded-md px-3 py-3"
                  >
                    <span
                      className={cn(
                        "mt-1.25 size-2 shrink-0 rounded-full",
                        target.connected ? "bg-success" : "bg-text-tertiary/25"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-medium text-text-primary">
                          {parts.name}
                        </span>
                        {target.kind === "project" && (
                          <span className="whitespace-nowrap rounded border border-accent/30 bg-accent/8 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                            Project
                          </span>
                        )}
                        {target.metadataIncomplete && (
                          <AlertTriangle size={11} className="shrink-0 text-warning" />
                        )}
                      </div>
                      <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
                        {parts.technicalLabel && (
                          <span className="max-w-md truncate">
                            {parts.technicalLabel}
                          </span>
                        )}
                        <span className="rounded border border-border/60 bg-bg-elevated px-1.5 py-0.5 text-[10px]">
                          {parts.protocol}
                        </span>
                        <span className="rounded border border-border/60 bg-bg-elevated px-1.5 py-0.5 text-[10px] font-mono">
                          {parts.publicId}
                        </span>
                        {target.databaseLabel && (
                          <span className="rounded border border-border/60 bg-bg-elevated px-1.5 py-0.5 text-[10px]">
                            db={target.databaseLabel}
                          </span>
                        )}
                      </div>
                      {target.metadataWarning && (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-warning">
                          <AlertTriangle size={10} className="shrink-0" />
                          {target.metadataWarning}
                        </div>
                      )}
                    </div>
                    {selected && (
                      <Check size={14} className="mt-0.75 shrink-0 text-accent" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            {selectedTarget?.kind === "client" && (
              <>
                <CommandSeparator className="my-2" />
                <CommandGroup
                  heading="Runtimes"
                  className="**:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pb-1.5 **:[[cmdk-group-heading]]:pt-1 **:[[cmdk-group-heading]]:text-[10px] **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-widest **:[[cmdk-group-heading]]:text-text-tertiary/50"
                >
                  {selectedTarget.runtimes.length > 1 && (
                    <CommandItem
                      value={`runtime:all:${selectedTarget.label}:all runtimes`}
                      onSelect={() => {
                        selectRuntimeFilter("all");
                        onOpenChange(false);
                      }}
                      className="gap-3 rounded-md px-3 py-3"
                    >
                      <span className="mt-1.25 size-2 shrink-0 rounded-full bg-success" />
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          All runtimes
                        </span>
                        <span className="rounded border border-border/60 bg-bg-elevated px-1.5 py-0.5 text-[10px] tabular-nums text-text-tertiary">
                          {selectedTarget.connectedRuntimes} connected
                        </span>
                      </div>
                      {selectedRuntimeFilter === "all" && (
                        <Check size={14} className="mt-0.75 shrink-0 text-accent" />
                      )}
                    </CommandItem>
                  )}
                  {selectedTarget.runtimes.map((runtime) => {
                    const label = getRuntimeLabel(runtime);
                    const browser = getRuntimeBrowser(runtime);
                    const runtimePublicId = getPublicRuntimeId(
                      runtime.runtimeId,
                      selectedTarget.runtimes.map((entry) => entry.runtimeId)
                    );
                    const selected =
                      selectedRuntimeFilter === runtime.runtimeId ||
                      (selectedTarget.runtimes.length === 1 &&
                        selectedRuntimeFilter !== "all");
                    return (
                      <CommandItem
                        key={runtime.runtimeId}
                        value={`runtime:${runtime.runtimeId}:${label}:${browser ?? ""}:${runtimePublicId}`}
                        onSelect={() => {
                          selectRuntime(runtime.runtimeId);
                          onOpenChange(false);
                        }}
                        className="items-start gap-3 rounded-md px-3 py-3"
                      >
                        <span
                          className={cn(
                            "mt-1.25 size-2 shrink-0 rounded-full",
                            runtime.connected
                              ? "bg-success"
                              : "bg-text-tertiary/25"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-text-primary">
                            {label}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary">
                            {browser && <span>{browser}</span>}
                            <span className="rounded border border-border/60 bg-bg-elevated px-1 py-0.5 text-[10px] font-mono">
                              {runtimePublicId}
                            </span>
                            {runtime.platform && (
                              <span className="rounded border border-border/60 bg-bg-elevated px-1 py-0.5 text-[10px]">
                                {runtime.platform}
                              </span>
                            )}
                          </div>
                        </div>
                        {selected && (
                          <Check size={14} className="mt-0.75 shrink-0 text-accent" />
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
