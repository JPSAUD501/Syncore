import { createLazyFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Timer,
  XCircle
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { EmptyState, JsonViewer, TimestampCell } from "@/components/shared";
import { usePreferredTarget } from "@/hooks";
import { useDevtoolsSubscription } from "@/hooks/useReactiveData";
import { sendRequest } from "@/lib/store";
import { cn, formatRelativeTime } from "@/lib/utils";
import type {
  SchedulerJob,
  SchedulerMisfirePolicy,
  SchedulerRecurringSchedule
} from "@syncore/devtools-protocol";

export const Route = createLazyFileRoute("/scheduler")({
  component: SchedulerPage
});

type SchedulerEditorState = {
  argsText: string;
  runAtText: string;
  misfireType: SchedulerMisfirePolicy["type"];
  windowMs: string;
  schedule?: SchedulerRecurringSchedule;
};

const WEEK_DAYS: Array<Extract<
  SchedulerRecurringSchedule,
  { type: "weekly" }
>["dayOfWeek"]> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

function SchedulerPage() {
  const { targetRuntimeId, usingProjectTarget, supportsOffline } =
    usePreferredTarget();
  const [selectedJob, setSelectedJob] = useState<SchedulerJob | null>(null);
  const [editorState, setEditorState] = useState<SchedulerEditorState | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedJobId = selectedJob?.id ?? null;
  const selectedJobUpdatedAt = selectedJob?.updatedAt ?? null;

  const jobsSubscription = useDevtoolsSubscription(
    targetRuntimeId ? { kind: "scheduler.jobs" } : null,
    { enabled: Boolean(targetRuntimeId), targetRuntimeId }
  );

  const jobs = useMemo(
    () =>
      jobsSubscription.data?.kind === "scheduler.jobs.result"
        ? jobsSubscription.data.jobs
        : [],
    [jobsSubscription.data]
  );

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }
    const nextSelectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
    setSelectedJob(nextSelectedJob);
  }, [jobs, selectedJob, selectedJobId]);

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== "pending") {
      setEditorState(null);
      setActionError(null);
      return;
    }
    setEditorState(createEditorState(selectedJob));
    setActionError(null);
  }, [selectedJob, selectedJobId, selectedJobUpdatedAt]);

  const cancelJob = useCallback(
    async (jobId: string) => {
      if (!targetRuntimeId) {
        return;
      }
      setActionError(null);
      const result = await sendRequest(
        { kind: "scheduler.cancel", jobId },
        { targetRuntimeId }
      );
      if (result.kind === "scheduler.cancel.result" && result.error) {
        setActionError(result.error);
        return;
      }
      if (result.kind === "scheduler.cancel.result" && !result.cancelled) {
        setActionError("This job could not be cancelled anymore.");
      }
    },
    [targetRuntimeId]
  );

  const saveScheduledJob = useCallback(async () => {
    if (!targetRuntimeId || !selectedJob || !editorState) {
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const args = parseArgsText(editorState.argsText);
      const runAt = parseLocalDateTimeInput(editorState.runAtText);
      const schedule = isRecurringJob(selectedJob)
        ? editorState.schedule
        : undefined;
      const misfirePolicy = schedule ? parseMisfirePolicy(editorState) : undefined;
      const result = await sendRequest(
        {
          kind: "scheduler.update",
          jobId: selectedJob.id,
          args,
          runAt,
          ...(schedule ? { schedule } : {}),
          ...(misfirePolicy ? { misfirePolicy } : {})
        },
        { targetRuntimeId }
      );
      if (result.kind !== "scheduler.update.result") {
        return;
      }
      if (result.error) {
        setActionError(result.error);
        return;
      }
      if (!result.updated) {
        setActionError("This job is no longer editable.");
        return;
      }
      if (result.job) {
        setSelectedJob(result.job);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }, [editorState, selectedJob, targetRuntimeId]);

  const allJobs = useMemo(() => [...jobs].sort((a, b) => b.runAt - a.runAt), [jobs]);
  const pendingJobs = useMemo(
    () => allJobs.filter((job) => job.status === "pending" || job.status === "running"),
    [allJobs]
  );
  const recurringJobs = useMemo(
    () => allJobs.filter((job) => Boolean(job.recurringName && job.schedule)),
    [allJobs]
  );
  const historyJobs = useMemo(
    () =>
      allJobs.filter((job) =>
        ["completed", "failed", "cancelled"].includes(job.status)
      ),
    [allJobs]
  );

  if (!targetRuntimeId) {
    return (
      <div className="h-[calc(100vh-7rem)]">
        <EmptyState
          icon={Clock}
          title="Scheduler unavailable"
          description={
            supportsOffline
              ? "The project target is not available right now."
              : "Connect a runtime or configure a project target to manage scheduled jobs."
          }
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-7rem)] lg:flex-row">
      <div className="flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-bg-surface lg:flex-1">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Clock size={16} className="text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-bold text-text-primary">Scheduler</h2>
            <p className="text-[11px] text-text-tertiary">Manage and edit scheduled function calls</p>
          </div>
          {usingProjectTarget && (
            <Badge variant="outline" className="text-[9px]">
              Project Offline
            </Badge>
          )}
          {jobsSubscription.loading && (
            <Loader2 size={12} className="animate-spin text-text-tertiary" />
          )}
        </div>

        <Tabs defaultValue="pending" className="flex flex-col lg:min-h-0 lg:flex-1">
          <div className="border-b border-border px-4">
            <TabsList variant="line" className="h-9">
              <TabsTrigger value="pending" className="gap-1">
                <Timer size={12} />
                Pending
                {pendingJobs.length > 0 && (
                  <Badge variant="warning" className="ml-1 px-1 py-0 text-[9px]">
                    {pendingJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="recurring" className="gap-1">
                <CalendarClock size={12} />
                Recurring
                {recurringJobs.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1 py-0 text-[9px]">
                    {recurringJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1">
                <CheckCircle2 size={12} />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending" className="lg:min-h-0 lg:flex-1">
            <JobList
              jobs={pendingJobs}
              selectedJobId={selectedJob?.id ?? null}
              onSelect={setSelectedJob}
              onCancel={(jobId) => {
                void cancelJob(jobId);
              }}
              emptyTitle="No pending jobs"
              emptyDescription="Scheduled jobs will appear here when they are queued."
            />
          </TabsContent>

          <TabsContent value="recurring" className="lg:min-h-0 lg:flex-1">
            <JobList
              jobs={recurringJobs}
              selectedJobId={selectedJob?.id ?? null}
              onSelect={setSelectedJob}
              onCancel={(jobId) => {
                void cancelJob(jobId);
              }}
              emptyTitle="No recurring jobs"
              emptyDescription="Recurring jobs will appear here once they are registered."
            />
          </TabsContent>

          <TabsContent value="history" className="lg:min-h-0 lg:flex-1">
            <JobList
              jobs={historyJobs}
              selectedJobId={selectedJob?.id ?? null}
              onSelect={setSelectedJob}
              emptyTitle="No job history"
              emptyDescription="Completed, failed and cancelled jobs will appear here."
            />
          </TabsContent>
        </Tabs>
      </div>

      {selectedJob && (
        <div key={selectedJob.id} className="fixed inset-0 z-50 flex flex-col bg-bg-surface lg:contents">
          <JobDetailPanel
            job={selectedJob}
            editorState={editorState}
            saving={saving}
            error={actionError}
            usingProjectTarget={usingProjectTarget}
            onClose={() => setSelectedJob(null)}
            onCancel={(jobId) => {
              void cancelJob(jobId);
            }}
            onEditorChange={setEditorState}
            onSave={() => {
              void saveScheduledJob();
            }}
          />
        </div>
      )}
    </div>
  );
}

function JobList({
  jobs,
  selectedJobId,
  onSelect,
  onCancel,
  emptyTitle,
  emptyDescription
}: {
  jobs: SchedulerJob[];
  selectedJobId: string | null;
  onSelect: (job: SchedulerJob) => void;
  onCancel?: (jobId: string) => void;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (jobs.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={emptyTitle}
        description={emptyDescription}
        className="h-full"
      />
    );
  }

  return (
    <ScrollArea className="max-h-[60vh] lg:h-full lg:max-h-none">
      <div className="space-y-1 p-2">
        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => onSelect(job)}
            className={cn(
              "cursor-pointer rounded-md border px-3 py-2.5 transition-colors",
              selectedJobId === job.id
                ? "border-accent/20 bg-accent/8"
                : "border-transparent hover:bg-bg-base"
            )}
          >
            <div className="flex items-start gap-3">
              <JobStatusIcon status={job.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[12px] text-text-primary">
                    {job.functionName.replaceAll("/", ":")}
                  </span>
                  {job.scheduleLabel && (
                    <Badge variant="outline" className="px-1 py-0 text-[8px]">
                      {job.scheduleLabel}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-text-tertiary">
                  <span>{formatRelativeTime(job.runAt)}</span>
                  {job.recurringName && (
                    <span className="font-medium text-text-secondary">{job.recurringName}</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <JobStatusBadge status={job.status} />
                {onCancel && job.status === "pending" && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onCancel(job.id);
                    }}
                    title="Cancel job"
                  >
                    <XCircle size={12} className="text-error" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function JobDetailPanel({
  job,
  editorState,
  saving,
  error,
  usingProjectTarget,
  onClose,
  onCancel,
  onEditorChange,
  onSave
}: {
  job: SchedulerJob;
  editorState: SchedulerEditorState | null;
  saving: boolean;
  error: string | null;
  usingProjectTarget: boolean;
  onClose: () => void;
  onCancel: (jobId: string) => void;
  onEditorChange: (state: SchedulerEditorState | null) => void;
  onSave: () => void;
}) {
  const canEdit = job.status === "pending" && editorState;
  const isRecurring = isRecurringJob(job);

  return (
    <div className="flex flex-1 flex-col overflow-hidden lg:h-auto lg:flex-none lg:rounded-md lg:border lg:border-border lg:w-96 lg:shrink-0">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <JobStatusIcon status={job.status} />
            <code className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-text-primary">
              {job.functionName.replaceAll("/", ":")}
            </code>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <Badge variant="outline" className="text-[9px]">
              {isRecurring ? "Recurring" : "One-shot"}
            </Badge>
            {job.recurringName && (
              <span className="truncate text-[10px] text-text-tertiary">
                {job.recurringName}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XCircle size={12} />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        defaultValue={canEdit ? "edit" : "info"}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="shrink-0 border-b border-border px-4">
          <TabsList variant="line" className="h-9">
            <TabsTrigger value="info" className="text-[12px]">
              Info
            </TabsTrigger>
            {canEdit && (
              <TabsTrigger value="edit" className="text-[12px]">
                Edit
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Info tab */}
        <TabsContent value="info" className="overflow-y-auto">
          <div className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-3">
              <DetailField label="Scheduled At">
                <TimestampCell timestamp={job.scheduledAt} format="both" />
              </DetailField>
              <DetailField label="Run At">
                <TimestampCell timestamp={job.runAt} format="both" />
              </DetailField>
              {job.lastRunAt && (
                <DetailField label="Last Run">
                  <TimestampCell timestamp={job.lastRunAt} format="both" />
                </DetailField>
              )}
              {job.updatedAt && (
                <DetailField label="Updated At">
                  <TimestampCell timestamp={job.updatedAt} format="both" />
                </DetailField>
              )}
            </div>

            {job.scheduleLabel && (
              <DetailField label="Schedule">
                <code className="block rounded bg-bg-base px-2 py-1 text-[11px] text-text-code">
                  {job.scheduleLabel}
                </code>
              </DetailField>
            )}

            <DetailField label="Arguments">
              <JsonViewer data={job.args} defaultExpanded maxDepth={4} />
            </DetailField>

            <DetailField label="Job ID">
              <code className="block break-all rounded bg-bg-base px-2 py-1 text-[10px] text-text-code opacity-60">
                {job.id}
              </code>
            </DetailField>

            {job.status !== "pending" && (
              <div className="flex items-start gap-2 rounded-md border border-border bg-bg-base px-3 py-2.5 text-[11px] text-text-tertiary">
                <Info size={12} className="mt-0.5 shrink-0" />
                <span>
                  {job.status === "running"
                    ? "This job is currently running."
                    : `This job has already ${job.status}.`}
                </span>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Edit tab */}
        {canEdit && editorState && (
          <TabsContent value="edit" className="flex min-h-0 flex-col">
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-5 p-4">
                {isRecurring && editorState.schedule && (
                  <ScheduleEditor
                    state={{ ...editorState, schedule: editorState.schedule }}
                    onChange={onEditorChange}
                  />
                )}

                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-text-tertiary">
                    {isRecurring ? "Next Run (override)" : "Run At"}
                  </label>
                  <input
                    type="datetime-local"
                    value={editorState.runAtText}
                    onChange={(event) =>
                      onEditorChange({
                        ...editorState,
                        runAtText: event.target.value
                      })
                    }
                    className="h-9 w-full rounded-md border border-border bg-bg-base px-3 text-[12px] text-text-primary outline-none scheme-dark focus:border-border-active"
                  />
                </div>

                <NextRunPreview state={editorState} isRecurring={isRecurring} />

                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-text-tertiary">
                    Arguments
                    <span className="ml-1.5 rounded bg-bg-elevated px-1 py-0.5 text-[9px] font-normal text-text-tertiary">
                      JSON
                    </span>
                  </label>
                  <textarea
                    value={editorState.argsText}
                    onChange={(event) =>
                      onEditorChange({
                        ...editorState,
                        argsText: event.target.value
                      })
                    }
                    className="min-h-28 w-full rounded-md border border-border bg-bg-base px-3 py-2 font-mono text-[12px] text-text-primary outline-none transition-colors focus:border-border-active"
                    spellCheck={false}
                    placeholder="[]"
                  />
                </div>

                {isRecurring && (
                  <div className="space-y-2">
                    <label className="block text-[11px] font-medium text-text-tertiary">
                      Misfire Policy
                    </label>
                    <Select
                      value={editorState.misfireType}
                      onValueChange={(value) =>
                        onEditorChange({
                          ...editorState,
                          misfireType: value as SchedulerMisfirePolicy["type"]
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-full text-[12px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="catch_up">Catch up — run all missed</SelectItem>
                        <SelectItem value="skip">Skip — ignore if missed</SelectItem>
                        <SelectItem value="run_once_if_missed">Run once if missed</SelectItem>
                        <SelectItem value="windowed">Windowed — within a time window</SelectItem>
                      </SelectContent>
                    </Select>
                    {editorState.misfireType === "windowed" && (
                      <Input
                        type="number"
                        min="0"
                        value={editorState.windowMs}
                        onChange={(event) =>
                          onEditorChange({
                            ...editorState,
                            windowMs: event.target.value
                          })
                        }
                        placeholder="Window in milliseconds"
                      />
                    )}
                  </div>
                )}

                {error && (
                  <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
                    {error}
                  </div>
                )}
              </div>
            </div>

            {/* Sticky action footer */}
            <div className="shrink-0 border-t border-border bg-bg-surface p-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={() => void onSave()}
                  disabled={saving}
                >
                  {saving && <Loader2 size={12} className="animate-spin" />}
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onCancel(job.id)}
                  disabled={saving}
                >
                  Cancel Job
                </Button>
              </div>
              {usingProjectTarget && (
                <p className="mt-1.5 text-center text-[10px] text-text-tertiary">
                  Running in project offline mode
                </p>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function ScheduleEditor({
  state,
  onChange
}: {
  state: SchedulerEditorState & { schedule: SchedulerRecurringSchedule };
  onChange: (state: SchedulerEditorState) => void;
}) {
  const schedule = state.schedule;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-text-tertiary">
          Schedule Type
        </label>
        <Select
          value={schedule.type}
          onValueChange={(value) =>
            onChange({
              ...state,
              schedule: createScheduleForType(
                value as SchedulerRecurringSchedule["type"]
              )
            })
          }
        >
          <SelectTrigger className="h-9 w-full text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="interval">Interval — repeat every N hours/min/sec</SelectItem>
            <SelectItem value="daily">Daily — at a specific time each day</SelectItem>
            <SelectItem value="weekly">Weekly — on a specific day and time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {schedule.type === "interval" && (
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Hours"
            value={schedule.hours ?? 0}
            onChange={(value) =>
              onChange({
                ...state,
                schedule: { ...schedule, hours: value }
              })
            }
          />
          <NumberField
            label="Minutes"
            value={schedule.minutes ?? 0}
            onChange={(value) =>
              onChange({
                ...state,
                schedule: { ...schedule, minutes: value }
              })
            }
          />
          <NumberField
            label="Seconds"
            value={schedule.seconds ?? 0}
            onChange={(value) =>
              onChange({
                ...state,
                schedule: { ...schedule, seconds: value }
              })
            }
          />
        </div>
      )}

      {schedule.type === "daily" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Hour"
              value={schedule.hour}
              onChange={(value) =>
                onChange({
                  ...state,
                  schedule: { ...schedule, hour: value }
                })
              }
            />
            <NumberField
              label="Minute"
              value={schedule.minute}
              onChange={(value) =>
                onChange({
                  ...state,
                  schedule: { ...schedule, minute: value }
                })
              }
            />
          </div>
          <Input
            value={schedule.timezone ?? ""}
            onChange={(event) =>
              onChange({
                ...state,
                schedule: withScheduleTimezone(schedule, event.target.value)
              })
            }
            placeholder="Timezone (optional)"
          />
        </div>
      )}

      {schedule.type === "weekly" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-medium text-text-tertiary">
              Day of Week
            </label>
            <div className="flex flex-wrap gap-1">
              {WEEK_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...state,
                      schedule: {
                        ...schedule,
                        dayOfWeek: day
                      }
                    })
                  }
                  className={cn(
                    "rounded px-2.5 py-1 text-[11px] font-medium transition-colors",
                    schedule.dayOfWeek === day
                      ? "bg-accent text-bg-deep"
                      : "border border-border bg-bg-base text-text-secondary hover:text-text-primary"
                  )}
                >
                  {day.slice(0, 3).charAt(0).toUpperCase() + day.slice(1, 3)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Hour"
              value={schedule.hour}
              onChange={(value) =>
                onChange({
                  ...state,
                  schedule: { ...schedule, hour: value }
                })
              }
            />
            <NumberField
              label="Minute"
              value={schedule.minute}
              onChange={(value) =>
                onChange({
                  ...state,
                  schedule: { ...schedule, minute: value }
                })
              }
            />
          </div>
          <Input
            value={schedule.timezone ?? ""}
            onChange={(event) =>
              onChange({
                ...state,
                schedule: withScheduleTimezone(schedule, event.target.value)
              })
            }
            placeholder="Timezone (optional)"
          />
        </div>
      )}
    </div>
  );
}

function NextRunPreview({
  state,
  isRecurring
}: {
  state: SchedulerEditorState;
  isRecurring: boolean;
}) {
  const runs = useMemo(() => {
    try {
      if (!isRecurring || !state.schedule) {
        const ts = parseLocalDateTimeInput(state.runAtText);
        return [ts];
      }
      const result: number[] = [];
      let from = Date.now();
      for (let i = 0; i < 3; i++) {
        from = computeSchedulePreview(state.schedule, from);
        result.push(from);
      }
      return result;
    } catch {
      return [];
    }
  }, [state, isRecurring]);

  if (runs.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-bg-base px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
        <CalendarClock size={11} />
        {isRecurring ? "Next runs" : "Scheduled for"}
      </div>
      <div className="space-y-1.5">
        {runs.map((ts, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            {isRecurring && (
              <span className="w-4 shrink-0 text-[10px] text-text-tertiary tabular-nums">
                #{i + 1}
              </span>
            )}
            <TimestampCell timestamp={ts} format="both" className="flex-1 text-[11px]" />
            <span className="shrink-0 text-[10px] text-text-tertiary">
              {formatRelativeTime(ts)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] font-medium text-text-tertiary">
        {label}
      </span>
      <Input
        type="number"
        min="0"
        value={String(value)}
        onChange={(event) => onChange(parseInt(event.target.value || "0", 10))}
      />
    </label>
  );
}

function DetailField({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-text-tertiary">
        {label}
      </label>
      {children}
    </div>
  );
}

function JobStatusIcon({ status }: { status: SchedulerJob["status"] }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} className="text-success" />;
    case "failed":
      return <AlertCircle size={14} className="text-error" />;
    case "cancelled":
      return <XCircle size={14} className="text-text-tertiary" />;
    default:
      return <Clock size={14} className="text-warning" />;
  }
}

function JobStatusBadge({ status }: { status: SchedulerJob["status"] }) {
  const variant =
    status === "completed"
      ? "success"
      : status === "failed"
        ? "destructive"
        : status === "cancelled"
          ? "secondary"
          : "warning";
  return <Badge variant={variant}>{status}</Badge>;
}

function isRecurringJob(
  job: SchedulerJob
): job is SchedulerJob & {
  recurringName: string;
  schedule: SchedulerRecurringSchedule;
} {
  return Boolean(job.recurringName && job.schedule);
}

function createEditorState(job: SchedulerJob): SchedulerEditorState {
  return {
    argsText: JSON.stringify(job.args, null, 2),
    runAtText: formatLocalDateTimeInput(job.runAt),
    misfireType: job.misfirePolicy?.type ?? "catch_up",
    windowMs:
      job.misfirePolicy?.type === "windowed"
        ? String(job.misfirePolicy.windowMs)
        : "",
    ...(job.schedule ? { schedule: job.schedule } : {})
  };
}

function createScheduleForType(
  type: SchedulerRecurringSchedule["type"]
): SchedulerRecurringSchedule {
  switch (type) {
    case "interval":
      return { type, minutes: 5 };
    case "daily":
      return { type, hour: 9, minute: 0 };
    case "weekly":
      return { type, dayOfWeek: "monday", hour: 9, minute: 0 };
  }
}

function withScheduleTimezone<
  TSchedule extends Extract<
    SchedulerRecurringSchedule,
    { type: "daily" | "weekly" }
  >
>(schedule: TSchedule, timezone: string): TSchedule {
  const nextTimezone = timezone.trim();
  if (!nextTimezone) {
    const rest = { ...schedule };
    delete rest.timezone;
    return rest;
  }
  return {
    ...schedule,
    timezone: nextTimezone
  };
}

function parseArgsText(text: string): Record<string, unknown> {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function formatLocalDateTimeInput(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes())
  ].join("");
}

function parseLocalDateTimeInput(value: string): number {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (!value || Number.isNaN(timestamp)) {
    throw new Error("Run At must be a valid local date and time.");
  }
  return timestamp;
}

function previewNextRunAt(
  state: SchedulerEditorState,
  recurring: boolean
): number | null {
  if (!recurring || !state.schedule) {
    try {
      return parseLocalDateTimeInput(state.runAtText);
    } catch {
      return null;
    }
  }
  return computeSchedulePreview(state.schedule, Date.now());
}

function computeSchedulePreview(
  schedule: SchedulerRecurringSchedule,
  from: number
): number {
  if (schedule.type === "interval") {
    const delayMs =
      ((schedule.hours ?? 0) * 60 * 60 +
        (schedule.minutes ?? 0) * 60 +
        (schedule.seconds ?? 0)) *
      1000;
    return from + Math.max(delayMs, 1000);
  }
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(schedule.hour, schedule.minute, 0, 0);
  if (schedule.type === "weekly") {
    const targetDay = WEEK_DAYS.indexOf(schedule.dayOfWeek);
    const currentDay = next.getDay();
    const dayDelta = (targetDay - currentDay + 7) % 7;
    next.setDate(next.getDate() + dayDelta);
  }
  if (next.getTime() <= from) {
    next.setDate(next.getDate() + (schedule.type === "weekly" ? 7 : 1));
  }
  return next.getTime();
}

function parseMisfirePolicy(
  state: SchedulerEditorState
): SchedulerMisfirePolicy {
  if (state.misfireType !== "windowed") {
    return { type: state.misfireType };
  }
  const windowMs = Number(state.windowMs);
  if (!Number.isFinite(windowMs) || windowMs < 0) {
    throw new Error("Windowed misfire policy requires a valid window in ms.");
  }
  return {
    type: "windowed",
    windowMs
  };
}
