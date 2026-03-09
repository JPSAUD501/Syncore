import { createLazyFileRoute } from "@tanstack/react-router";
import {
  Clock,
  XCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Loader2,
  CalendarClock,
  Timer
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  EmptyState,
  JsonViewer,
  FunctionBadge,
  TimestampCell
} from "@/components/shared";
import { useSnapshot, useConnection } from "@/hooks";
import { sendRequest } from "@/lib/store";
import { cn, formatDuration, formatRelativeTime } from "@/lib/utils";
import type { SchedulerJob } from "@syncore/devtools-protocol";

export const Route = createLazyFileRoute("/scheduler")({
  component: SchedulerPage
});

function SchedulerPage() {
  const { connected } = useConnection();
  const { pendingJobs } = useSnapshot();
  const [jobs, setJobs] = useState<SchedulerJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<SchedulerJob | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Fetch jobs from runtime                                          */
  /* ---------------------------------------------------------------- */

  const fetchJobs = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await sendRequest({ kind: "scheduler.list" });
      if (res.kind === "scheduler.list.result") {
        setJobs(res.jobs);
      }
    } catch {
      /* runtime may not support scheduler.list yet */
    } finally {
      setLoading(false);
    }
  }, [connected]);

  /* ---------------------------------------------------------------- */
  /*  Cancel job                                                       */
  /* ---------------------------------------------------------------- */

  const cancelJob = useCallback(
    async (jobId: string) => {
      if (!connected) return;
      try {
        const res = await sendRequest({ kind: "scheduler.cancel", jobId });
        if (res.kind === "scheduler.cancel.result" && res.success) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobId ? { ...j, status: "cancelled" as const } : j
            )
          );
          if (selectedJob?.id === jobId) {
            setSelectedJob((prev) =>
              prev ? { ...prev, status: "cancelled" as const } : null
            );
          }
        }
      } catch {
        /* ignore */
      }
    },
    [connected, selectedJob]
  );

  /* ---------------------------------------------------------------- */
  /*  Combine snapshot jobs with fetched jobs                          */
  /* ---------------------------------------------------------------- */

  const allJobs = useMemo(() => {
    const map = new Map<string, SchedulerJob>();

    // Fetched jobs take priority
    for (const j of jobs) {
      map.set(j.id, j);
    }

    // Add snapshot pending jobs if not already present
    for (const j of pendingJobs) {
      if (!map.has(j.id)) {
        map.set(j.id, {
          id: j.id,
          functionName: j.functionName,
          args: {},
          scheduledAt: j.runAt,
          runAt: j.runAt,
          status: j.status as SchedulerJob["status"]
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.runAt - a.runAt);
  }, [jobs, pendingJobs]);

  const pendingJobsList = useMemo(
    () =>
      allJobs.filter((j) => j.status === "pending" || j.status === "running"),
    [allJobs]
  );

  const cronJobs = useMemo(
    () => allJobs.filter((j) => j.cronSchedule),
    [allJobs]
  );

  const completedJobs = useMemo(
    () =>
      allJobs.filter(
        (j) =>
          j.status === "completed" ||
          j.status === "failed" ||
          j.status === "cancelled"
      ),
    [allJobs]
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      {/* ---- Main content ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Clock size={16} className="text-accent" />
          <h2 className="text-[14px] font-bold text-text-primary flex-1">
            Scheduler
          </h2>
          <Button
            variant="outline"
            size="xs"
            onClick={fetchJobs}
            disabled={!connected || loading}
            className="gap-1"
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="pending" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 border-b border-border">
            <TabsList variant="line" className="h-9">
              <TabsTrigger value="pending" className="gap-1">
                <Timer size={12} />
                Pending
                {pendingJobsList.length > 0 && (
                  <Badge
                    variant="warning"
                    className="ml-1 text-[9px] px-1 py-0"
                  >
                    {pendingJobsList.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="cron" className="gap-1">
                <CalendarClock size={12} />
                Cron Jobs
                {cronJobs.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 text-[9px] px-1 py-0"
                  >
                    {cronJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1">
                <CheckCircle2 size={12} />
                History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="pending" className="flex-1 min-h-0">
            <JobList
              jobs={pendingJobsList}
              selectedJob={selectedJob}
              onSelect={setSelectedJob}
              onCancel={cancelJob}
              emptyTitle="No pending jobs"
              emptyDescription="Scheduled jobs will appear here when they're queued."
            />
          </TabsContent>

          <TabsContent value="cron" className="flex-1 min-h-0">
            <JobList
              jobs={cronJobs}
              selectedJob={selectedJob}
              onSelect={setSelectedJob}
              onCancel={cancelJob}
              emptyTitle="No cron jobs"
              emptyDescription="Recurring cron jobs will appear here."
            />
          </TabsContent>

          <TabsContent value="history" className="flex-1 min-h-0">
            <JobList
              jobs={completedJobs}
              selectedJob={selectedJob}
              onSelect={setSelectedJob}
              emptyTitle="No job history"
              emptyDescription="Completed, failed, and cancelled jobs will appear here."
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* ---- Job detail panel ---- */}
      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onCancel={cancelJob}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job list                                                           */
/* ------------------------------------------------------------------ */

function JobList({
  jobs,
  selectedJob,
  onSelect,
  onCancel,
  emptyTitle,
  emptyDescription
}: {
  jobs: SchedulerJob[];
  selectedJob: SchedulerJob | null;
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
      <div className="p-2 space-y-1">
        {jobs.map((job) => (
          <div
            key={job.id}
            onClick={() => onSelect(job)}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer",
              selectedJob?.id === job.id
                ? "bg-accent/8 border border-accent/15"
                : "hover:bg-bg-surface/50 border border-transparent"
            )}
          >
            <JobStatusIcon status={job.status} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono text-text-primary truncate">
                  {job.functionName}
                </span>
                {job.cronSchedule && (
                  <Badge
                    variant="outline"
                    className="text-[8px] px-1 py-0 shrink-0"
                  >
                    {job.cronSchedule}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-tertiary">
                  {formatRelativeTime(job.runAt)}
                </span>
                {job.durationMs !== undefined && (
                  <span className="text-[10px] text-text-tertiary">
                    {formatDuration(job.durationMs)}
                  </span>
                )}
              </div>
            </div>

            <JobStatusBadge status={job.status} />

            {onCancel &&
              (job.status === "pending" || job.status === "running") && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(job.id);
                  }}
                  title="Cancel job"
                >
                  <XCircle size={12} className="text-error" />
                </Button>
              )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

/* ------------------------------------------------------------------ */
/*  Job detail panel                                                   */
/* ------------------------------------------------------------------ */

function JobDetailPanel({
  job,
  onClose,
  onCancel
}: {
  job: SchedulerJob;
  onClose: () => void;
  onCancel: (id: string) => void;
}) {
  return (
    <div className="w-96 border-l border-border flex flex-col bg-bg-base">
      {/* Header */}
      <div className="p-3 border-b border-border flex items-center justify-between">
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
        <div className="p-4 space-y-4">
          {/* ID */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
              Job ID
            </label>
            <code className="text-[11px] text-text-code bg-bg-surface px-2 py-1 rounded block">
              {job.id}
            </code>
          </div>

          {/* Function */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
              Function
            </label>
            <code className="text-[11px] text-text-primary font-mono">
              {job.functionName}
            </code>
          </div>

          {/* Status */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
              Status
            </label>
            <JobStatusBadge status={job.status} />
          </div>

          {/* Timing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
                Scheduled At
              </label>
              <TimestampCell timestamp={job.scheduledAt} format="both" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
                Run At
              </label>
              <TimestampCell timestamp={job.runAt} format="both" />
            </div>
            {job.completedAt && (
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
                  Completed At
                </label>
                <TimestampCell timestamp={job.completedAt} format="both" />
              </div>
            )}
            {job.durationMs !== undefined && (
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
                  Duration
                </label>
                <span className="text-[12px] text-text-primary font-mono">
                  {formatDuration(job.durationMs)}
                </span>
              </div>
            )}
          </div>

          {/* Cron schedule */}
          {job.cronSchedule && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-1">
                Cron Schedule
              </label>
              <code className="text-[11px] text-fn-cron bg-fn-cron/10 px-2 py-1 rounded block">
                {job.cronSchedule}
              </code>
            </div>
          )}

          <Separator />

          {/* Arguments */}
          <div>
            <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-2">
              Arguments
            </label>
            <JsonViewer data={job.args} defaultExpanded maxDepth={4} />
          </div>

          {/* Result */}
          {job.result !== undefined && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-2">
                Result
              </label>
              <JsonViewer data={job.result} defaultExpanded maxDepth={4} />
            </div>
          )}

          {/* Error */}
          {job.error && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-text-tertiary block mb-2">
                Error
              </label>
              <div className="rounded-md border border-error/20 bg-error/5 p-3">
                <p className="text-[11px] text-error font-mono whitespace-pre-wrap">
                  {job.error}
                </p>
              </div>
            </div>
          )}

          {/* Cancel button */}
          {(job.status === "pending" || job.status === "running") && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onCancel(job.id)}
              className="w-full gap-1.5"
            >
              <XCircle size={13} />
              Cancel Job
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

function JobStatusIcon({ status }: { status: SchedulerJob["status"] }) {
  switch (status) {
    case "pending":
      return <Clock size={14} className="text-fn-cron shrink-0" />;
    case "running":
      return <Loader2 size={14} className="text-info shrink-0 animate-spin" />;
    case "completed":
      return <CheckCircle2 size={14} className="text-success shrink-0" />;
    case "failed":
      return <AlertCircle size={14} className="text-error shrink-0" />;
    case "cancelled":
      return <XCircle size={14} className="text-text-tertiary shrink-0" />;
  }
}

function JobStatusBadge({ status }: { status: SchedulerJob["status"] }) {
  const variants: Record<
    SchedulerJob["status"],
    "warning" | "info" | "success" | "destructive" | "secondary"
  > = {
    pending: "warning",
    running: "info",
    completed: "success",
    failed: "destructive",
    cancelled: "secondary"
  };

  return (
    <Badge variant={variants[status]} className="text-[9px]">
      {status}
    </Badge>
  );
}
