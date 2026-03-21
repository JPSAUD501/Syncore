import type {
  FunctionReference,
  MisfirePolicy,
  RecurringJobDefinition
} from "../../functions.js";
import type {
  JsonObject,
  SyncoreSqlDriver,
  UpdateScheduledJobOptions
} from "../../runtime.js";
import { type DevtoolsEngine } from "./devtoolsEngine.js";
import {
  computeNextRun,
  parseMisfirePolicy,
  shouldRunMissedJob,
  stableStringify,
  type ScheduledJobRow
} from "./shared.js";
import { generateId } from "../../id.js";

type SchedulerEngineDeps = {
  driver: SyncoreSqlDriver;
  runtimeId: string;
  devtools: DevtoolsEngine;
  recurringJobs: RecurringJobDefinition[];
  pollIntervalMs: number;
  runMutation: (
    reference: FunctionReference<"mutation", unknown, unknown>,
    args: JsonObject
  ) => Promise<unknown>;
  runAction: (
    reference: FunctionReference<"action", unknown, unknown>,
    args: JsonObject
  ) => Promise<unknown>;
};

export class SchedulerEngine {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly deps: SchedulerEngineDeps) {}

  async prepare(): Promise<void> {
    await this.deps.driver.exec(`
      CREATE TABLE IF NOT EXISTS "_scheduled_functions" (
        id TEXT PRIMARY KEY,
        function_name TEXT NOT NULL,
        function_kind TEXT NOT NULL,
        args_json TEXT NOT NULL,
        status TEXT NOT NULL,
        run_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        recurring_name TEXT,
        schedule_json TEXT,
        timezone TEXT,
        misfire_policy TEXT NOT NULL,
        last_run_at INTEGER,
        window_ms INTEGER
      );
    `);
  }

  startPolling(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.processDueJobs();
    }, this.deps.pollIntervalMs);
  }

  stopPolling(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async scheduleJob(
    runAt: number,
    reference: FunctionReference<"mutation" | "action", unknown, unknown>,
    args: JsonObject,
    misfirePolicy: MisfirePolicy
  ): Promise<string> {
    const id = generateId();
    const now = Date.now();
    await this.deps.driver.run(
      `INSERT INTO "_scheduled_functions"
        (id, function_name, function_kind, args_json, status, run_at, created_at, updated_at, recurring_name, schedule_json, timezone, misfire_policy, last_run_at, window_ms)
       VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?, NULL, NULL, NULL, ?, NULL, ?)`,
      [
        id,
        reference.name,
        reference.kind,
        stableStringify(args),
        runAt,
        now,
        now,
        misfirePolicy.type,
        misfirePolicy.type === "windowed" ? misfirePolicy.windowMs : null
      ]
    );
    this.notifySchedulerJobsChanged();
    return id;
  }

  async cancelScheduledJob(id: string): Promise<boolean> {
    const result = await this.deps.driver.run(
      `UPDATE "_scheduled_functions"
       SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND status = 'scheduled'`,
      [Date.now(), id]
    );
    if ((result.changes ?? 0) > 0) {
      this.notifySchedulerJobsChanged();
      return true;
    }
    return false;
  }

  async updateScheduledJob(options: UpdateScheduledJobOptions): Promise<boolean> {
    const existing = await this.deps.driver.get<{
      status: string;
      recurring_name: string | null;
    }>(
      `SELECT status, recurring_name FROM "_scheduled_functions" WHERE id = ?`,
      [options.id]
    );
    if (!existing || existing.status !== "scheduled" || !existing.recurring_name) {
      return false;
    }
    const now = Date.now();
    const runAt = options.runAt ?? computeNextRun(options.schedule, now);
    const result = await this.deps.driver.run(
      `UPDATE "_scheduled_functions"
       SET args_json = ?, run_at = ?, updated_at = ?, schedule_json = ?, timezone = ?, misfire_policy = ?, window_ms = ?
       WHERE id = ? AND status = 'scheduled' AND recurring_name IS NOT NULL`,
      [
        stableStringify(options.args),
        runAt,
        now,
        stableStringify(options.schedule),
        "timezone" in options.schedule ? (options.schedule.timezone ?? null) : null,
        options.misfirePolicy.type,
        options.misfirePolicy.type === "windowed"
          ? options.misfirePolicy.windowMs
          : null,
        options.id
      ]
    );
    if ((result.changes ?? 0) > 0) {
      this.notifySchedulerJobsChanged();
      return true;
    }
    return false;
  }

  async syncRecurringJobs(): Promise<void> {
    for (const job of this.deps.recurringJobs) {
      const id = `recurring:${job.name}`;
      const existing = await this.deps.driver.get<ScheduledJobRow>(
        `SELECT * FROM "_scheduled_functions" WHERE id = ?`,
        [id]
      );
      if (existing) {
        continue;
      }
      const nextRunAt = computeNextRun(job.schedule, Date.now());
      await this.deps.driver.run(
        `INSERT INTO "_scheduled_functions"
         (id, function_name, function_kind, args_json, status, run_at, created_at, updated_at, recurring_name, schedule_json, timezone, misfire_policy, last_run_at, window_ms)
         VALUES (?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          id,
          job.function.name,
          job.function.kind,
          stableStringify(job.args),
          nextRunAt,
          Date.now(),
          Date.now(),
          job.name,
          stableStringify(job.schedule),
          "timezone" in job.schedule ? (job.schedule.timezone ?? null) : null,
          job.misfirePolicy.type,
          job.misfirePolicy.type === "windowed"
            ? job.misfirePolicy.windowMs
            : null
        ]
      );
      this.notifySchedulerJobsChanged();
    }
  }

  private notifySchedulerJobsChanged(): void {
    this.deps.devtools.notifyScopes(["scheduler.jobs"]);
  }

  private async processDueJobs(): Promise<void> {
    const now = Date.now();
    const dueJobs = await this.deps.driver.all<ScheduledJobRow>(
      `SELECT * FROM "_scheduled_functions" WHERE status = 'scheduled' AND run_at <= ? ORDER BY run_at ASC`,
      [now]
    );
    const executedJobIds: string[] = [];

    for (const job of dueJobs) {
      const misfirePolicy = parseMisfirePolicy(
        job.misfire_policy,
        job.window_ms
      );
      if (!shouldRunMissedJob(job.run_at, now, misfirePolicy)) {
        await this.advanceOrFinalizeJob(job, "skipped", now);
        continue;
      }

      try {
        if (job.function_kind === "mutation") {
          await this.deps.runMutation(
            { kind: "mutation", name: job.function_name },
            JSON.parse(job.args_json) as JsonObject
          );
        } else {
          await this.deps.runAction(
            { kind: "action", name: job.function_name },
            JSON.parse(job.args_json) as JsonObject
          );
        }
        executedJobIds.push(job.id);
        await this.advanceOrFinalizeJob(job, "completed", now);
      } catch (error) {
        await this.deps.driver.run(
          `UPDATE "_scheduled_functions" SET status = 'failed', updated_at = ? WHERE id = ?`,
          [Date.now(), job.id]
        );
        this.notifySchedulerJobsChanged();
        this.deps.devtools.emit({
          type: "log",
          runtimeId: this.deps.runtimeId,
          level: "error",
          message: `Scheduled job ${job.id} failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          timestamp: Date.now()
        });
      }
    }

    if (executedJobIds.length > 0) {
      this.deps.devtools.emit({
        type: "scheduler.tick",
        runtimeId: this.deps.runtimeId,
        executedJobIds,
        timestamp: Date.now()
      });
      this.notifySchedulerJobsChanged();
    }
  }

  private async advanceOrFinalizeJob(
    job: ScheduledJobRow,
    terminalStatus: ScheduledJobRow["status"],
    executedAt: number
  ): Promise<void> {
    if (!job.recurring_name || !job.schedule_json) {
      await this.deps.driver.run(
        `UPDATE "_scheduled_functions" SET status = ?, updated_at = ?, last_run_at = ? WHERE id = ?`,
        [terminalStatus, executedAt, executedAt, job.id]
      );
      this.notifySchedulerJobsChanged();
      return;
    }

    const schedule = readRecurringSchedule(job.schedule_json);
    if (!schedule) {
      await this.deps.driver.run(
        `UPDATE "_scheduled_functions" SET status = ?, updated_at = ?, last_run_at = ? WHERE id = ?`,
        [terminalStatus, executedAt, executedAt, job.id]
      );
      this.notifySchedulerJobsChanged();
      return;
    }
    const nextRunAt = computeNextRun(schedule, executedAt + 1);
    await this.deps.driver.run(
      `UPDATE "_scheduled_functions"
       SET status = 'scheduled', run_at = ?, updated_at = ?, last_run_at = ?
       WHERE id = ?`,
      [nextRunAt, executedAt, executedAt, job.id]
    );
    this.notifySchedulerJobsChanged();
  }
}

function readRecurringSchedule(
  scheduleJson: string | null
): RecurringJobDefinition["schedule"] | undefined {
  if (!scheduleJson) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(scheduleJson);
    if (!isRecurringSchedule(parsed)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

function isRecurringSchedule(
  value: unknown
): value is RecurringJobDefinition["schedule"] {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }
  const schedule = value as Record<string, unknown>;
  switch (schedule.type) {
    case "interval":
      return (
        (schedule.seconds === undefined || typeof schedule.seconds === "number") &&
        (schedule.minutes === undefined || typeof schedule.minutes === "number") &&
        (schedule.hours === undefined || typeof schedule.hours === "number")
      );
    case "daily":
      return (
        typeof schedule.hour === "number" &&
        typeof schedule.minute === "number" &&
        (schedule.timezone === undefined || typeof schedule.timezone === "string")
      );
    case "weekly":
      return (
        isDayOfWeek(schedule.dayOfWeek) &&
        typeof schedule.hour === "number" &&
        typeof schedule.minute === "number" &&
        (schedule.timezone === undefined || typeof schedule.timezone === "string")
      );
    default:
      return false;
  }
}

function isDayOfWeek(
  value: unknown
): value is Extract<
  RecurringJobDefinition["schedule"],
  { type: "weekly" }
>["dayOfWeek"] {
  return (
    value === "sunday" ||
    value === "monday" ||
    value === "tuesday" ||
    value === "wednesday" ||
    value === "thursday" ||
    value === "friday" ||
    value === "saturday"
  );
}
