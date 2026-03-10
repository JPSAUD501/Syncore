import { createLazyFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Timer,
  XCircle
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  misfireType: SchedulerMisfirePolicy["type"];
  windowMs: string;
  schedule: SchedulerRecurringSchedule;
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
    if (!selectedJob || !isRecurringJob(selectedJob)) {
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

  const saveRecurringJob = useCallback(async () => {
    if (!targetRuntimeId || !selectedJob || !editorState || !isRecurringJob(selectedJob)) {
      return;
    }
    setSaving(true);
    setActionError(null);
    try {
      const args = parseArgsText(editorState.argsText);
      const misfirePolicy = parseMisfirePolicy(editorState);
      const result = await sendRequest(
        {
          kind: "scheduler.update",
          jobId: selectedJob.id,
          schedule: editorState.schedule,
          args,
          misfirePolicy
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
        setActionError("This recurring job is no longer editable.");
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
    <div className="flex h-[calc(100vh-7rem)] gap-3">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-bg-surface">
        <div className="flex items-center gap-3 border-b border-border p-4">
          <Clock size={16} className="text-accent" />
          <h2 className="flex-1 text-[14px] font-bold text-text-primary">
            Scheduler
          </h2>
          {usingProjectTarget && (
            <Badge variant="outline" className="text-[9px]">
              Project Offline
            </Badge>
          )}
          {jobsSubscription.loading && (
            <Loader2 size={12} className="animate-spin text-text-tertiary" />
          )}
        </div>

        <Tabs defaultValue="pending" className="flex min-h-0 flex-1 flex-col">
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

          <TabsContent value="pending" className="min-h-0 flex-1">
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

          <TabsContent value="recurring" className="min-h-0 flex-1">
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

          <TabsContent value="history" className="min-h-0 flex-1">
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
            void saveRecurringJob();
          }}
        />
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
    <ScrollArea className="h-full">
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
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-[12px] text-text-primary">
                    {job.functionName}
                  </span>
                  {job.scheduleLabel && (
                    <Badge variant="outline" className="px-1 py-0 text-[8px]">
                      {job.scheduleLabel}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-text-tertiary">
                  <span>{formatRelativeTime(job.runAt)}</span>
                  {job.recurringName && <span>{job.recurringName}</span>}
                </div>
              </div>
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
  const canEdit = job.status === "pending" && isRecurringJob(job) && editorState;

  return (
    <div className="hidden w-96 flex-col overflow-hidden rounded-md border border-border bg-bg-surface lg:flex">
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex items-center gap-2">
          <JobStatusIcon status={job.status} />
          <span className="text-[12px] font-bold text-text-primary">
            Job Details
          </span>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <XCircle size={12} />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <DetailField label="Job ID">
            <code className="block rounded bg-bg-base px-2 py-1 text-[11px] text-text-code">
              {job.id}
            </code>
          </DetailField>

          <DetailField label="Function">
            <code className="text-[11px] text-text-primary">{job.functionName}</code>
          </DetailField>

          {job.recurringName && (
            <DetailField label="Recurring Name">
              <span className="text-[12px] text-text-primary">{job.recurringName}</span>
            </DetailField>
          )}

          <DetailField label="Status">
            <JobStatusBadge status={job.status} />
          </DetailField>

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

          <Separator />

          <DetailField label="Arguments">
            <JsonViewer data={job.args} defaultExpanded maxDepth={4} />
          </DetailField>

          {canEdit && editorState ? (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-text-primary">
                    Recurring Job Editor
                  </span>
                  {usingProjectTarget && (
                    <Badge variant="outline" className="text-[9px]">
                      Project Offline
                    </Badge>
                  )}
                </div>

                <ScheduleEditor
                  state={editorState}
                  onChange={onEditorChange}
                />

                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-text-tertiary">
                    Arguments JSON
                  </label>
                  <textarea
                    value={editorState.argsText}
                    onChange={(event) =>
                      onEditorChange({
                        ...editorState,
                        argsText: event.target.value
                      })
                    }
                    className="min-h-28 w-full rounded-md border border-border bg-bg-base px-3 py-2 text-[12px] text-text-primary outline-none transition-colors focus:border-border-active"
                    spellCheck={false}
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-medium text-text-tertiary">
                    Misfire Policy
                  </label>
                  <select
                    value={editorState.misfireType}
                    onChange={(event) =>
                      onEditorChange({
                        ...editorState,
                        misfireType: event.target.value as SchedulerMisfirePolicy["type"]
                      })
                    }
                    className="h-9 w-full rounded-md border border-border bg-bg-base px-3 text-[12px] text-text-primary"
                  >
                    <option value="catch_up">Catch up</option>
                    <option value="skip">Skip</option>
                    <option value="run_once_if_missed">Run once if missed</option>
                    <option value="windowed">Windowed</option>
                  </select>
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
                      placeholder="Window in ms"
                    />
                  )}
                </div>

                {error && (
                  <div className="rounded-md border border-error/20 bg-error/5 px-3 py-2 text-[11px] text-error">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => void onSave()}
                    disabled={saving}
                  >
                    {saving && <Loader2 size={12} className="animate-spin" />}
                    Save Recurring Job
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void onCancel(job.id)}
                  >
                    Cancel Job
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Separator />
              <div className="rounded-md border border-border bg-bg-base px-3 py-2 text-[11px] text-text-tertiary">
                {isRecurringJob(job)
                  ? "Recurring jobs can only be edited while they are still scheduled."
                  : "One-shot jobs can only be cancelled before they run."}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ScheduleEditor({
  state,
  onChange
}: {
  state: SchedulerEditorState;
  onChange: (state: SchedulerEditorState) => void;
}) {
  const schedule = state.schedule;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="block text-[11px] font-medium text-text-tertiary">
          Schedule Type
        </label>
        <select
          value={schedule.type}
          onChange={(event) =>
            onChange({
              ...state,
              schedule: createScheduleForType(
                event.target.value as SchedulerRecurringSchedule["type"]
              )
            })
          }
          className="h-9 w-full rounded-md border border-border bg-bg-base px-3 text-[12px] text-text-primary"
        >
          <option value="interval">Interval</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
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
        <div className="space-y-2">
          <select
            value={schedule.dayOfWeek}
            onChange={(event) =>
              onChange({
                ...state,
                schedule: {
                  ...schedule,
                  dayOfWeek: event.target.value as (typeof WEEK_DAYS)[number]
                }
              })
            }
            className="h-9 w-full rounded-md border border-border bg-bg-base px-3 text-[12px] text-text-primary"
          >
            {WEEK_DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
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

function createEditorState(
  job: SchedulerJob & { schedule: SchedulerRecurringSchedule; misfirePolicy?: SchedulerMisfirePolicy }
): SchedulerEditorState {
  return {
    argsText: JSON.stringify(job.args, null, 2),
    misfireType: job.misfirePolicy?.type ?? "catch_up",
    windowMs:
      job.misfirePolicy?.type === "windowed"
        ? String(job.misfirePolicy.windowMs)
        : "",
    schedule: job.schedule
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
