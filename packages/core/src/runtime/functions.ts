import {
  ensureObjectValidator,
  isValidator,
  type Infer,
  type Validator,
  type ValidatorMap
} from "@syncore/schema";

/**
 * Discriminates the three function kinds Syncore supports.
 *
 * - `"query"` — read-only handler that observes local state. Syncore re-runs it
 *   automatically whenever any table it read changes, keeping connected clients
 *   up to date without manual cache invalidation.
 * - `"mutation"` — transactional write handler. Runs inside a single SQLite
 *   transaction and automatically invalidates every query that read the tables it
 *   modified.
 * - `"action"` — arbitrary async handler that may call external services, invoke
 *   other Syncore functions, or schedule deferred work. Actions do not run inside
 *   a transaction and cannot directly write to the database — they must delegate
 *   writes to mutations.
 */
export type SyncoreFunctionKind = "query" | "mutation" | "action";

/**
 * Convenience type representing a function that accepts no arguments.
 *
 * Used as the default `TArgs` for {@link FunctionReference} so that calling
 * `client.query(api.tasks.list)` without a second argument is type-safe.
 */
export type EmptyArgs = Record<never, never>;

/**
 * A typed, serialisable handle to a registered Syncore function.
 *
 * `FunctionReference` objects are how you address Syncore functions across the
 * entire API surface: hooks, client calls, scheduler helpers, and `ctx.runQuery`
 * / `ctx.runMutation` inside other functions all accept them. They carry the
 * function's kind and its fully-inferred arg / result types at the type level,
 * but at runtime they hold only the function's string name, making them safe to
 * pass across IPC channels.
 *
 * In almost every case you get references from the auto-generated `api` object
 * rather than constructing them manually:
 *
 * ```ts
 * import { api } from "../syncore/_generated/api";
 *
 * // In a React component:
 * const tasks = useQuery(api.tasks.list);
 *
 * // Inside a mutation that calls another function:
 * const id = await ctx.runMutation(api.tasks.create, { title: "Buy milk" });
 *
 * // Scheduling deferred work:
 * await ctx.scheduler.runAfter(60_000, api.notifications.send, { userId });
 * ```
 *
 * When you need to type a parameter that accepts a function reference, derive
 * the correct type with {@link FunctionReferenceFor}.
 */
export interface FunctionReference<
  TKind extends SyncoreFunctionKind = SyncoreFunctionKind,
  TArgs = EmptyArgs,
  TResult = unknown
> {
  kind: TKind;
  name: string;
  readonly __args?: TArgs;
  readonly __result?: TResult;
}

/**
 * The full definition of a Syncore function as produced by {@link query},
 * {@link mutation}, or {@link action}.
 *
 * This is the value you export from files inside `syncore/functions/`. Syncore
 * stores it in the function registry and uses the validators at runtime to parse
 * incoming arguments and optionally validate return values.
 *
 * You rarely reference this type directly in application code — use
 * {@link FunctionReferenceFor} when you need a type-level handle, or the
 * generated `api` object for runtime usage.
 */
export interface SyncoreFunctionDefinition<
  TKind extends SyncoreFunctionKind,
  TContext,
  TArgs,
  TResult
> {
  kind: TKind;
  argsValidator: Validator<TArgs, TArgs, string>;
  returnsValidator?: Validator<TResult, TResult, string>;
  handler: (ctx: TContext, args: TArgs) => Promise<TResult> | TResult;
}

/**
 * Extracts the argument type from a {@link FunctionReference}.
 *
 * Useful when writing generic helpers that accept a function reference and need
 * to type the corresponding arguments:
 *
 * ```ts
 * async function run<TRef extends FunctionReference<"mutation">>(
 *   ref: TRef,
 *   args: FunctionArgs<TRef>
 * ) { ... }
 * ```
 */
export type FunctionArgs<TReference> =
  TReference extends FunctionReference<
    SyncoreFunctionKind,
    infer TArgs,
    unknown
  >
    ? TArgs
    : never;

/**
 * Extracts the result type from a {@link FunctionReference}.
 *
 * ```ts
 * type TaskList = FunctionResult<typeof api.tasks.list>; // Task[]
 * ```
 */
export type FunctionResult<TReference> =
  TReference extends FunctionReference<
    SyncoreFunctionKind,
    unknown,
    infer TResult
  >
    ? TResult
    : never;

/**
 * Extracts the {@link SyncoreFunctionKind} from a function definition object.
 *
 * Used internally by {@link FunctionReferenceFor} and the code generator.
 */
export type FunctionKindFromDefinition<TDefinition> = TDefinition extends {
  kind: infer TKind;
}
  ? Extract<TKind, SyncoreFunctionKind>
  : never;

/**
 * Extracts the validated argument type from a function definition object.
 *
 * Used internally by {@link FunctionReferenceFor} and the code generator.
 */
export type FunctionArgsFromDefinition<TDefinition> = TDefinition extends {
  argsValidator: Validator<infer TArgs, unknown, string>;
}
  ? TArgs
  : never;

/**
 * Extracts the return type from a function definition object.
 *
 * Used internally by {@link FunctionReferenceFor} and the code generator.
 */
export type FunctionResultFromDefinition<TDefinition> = TDefinition extends {
  returnsValidator?: Validator<infer TResult, unknown, string>;
}
  ? TResult
  : never;

/**
 * Derives a fully-typed {@link FunctionReference} from a function definition.
 *
 * Use this when you need a typed reference to a function you have imported
 * directly — for example when writing test helpers or custom wrappers:
 *
 * ```ts
 * import type { create } from "../syncore/functions/tasks";
 *
 * type CreateRef = FunctionReferenceFor<typeof create>;
 * // FunctionReference<"mutation", { title: string }, string>
 * ```
 *
 * The generated `api` object already exposes `FunctionReferenceFor`-derived
 * values for every exported function, so you rarely need this in application
 * code.
 */
export type FunctionReferenceFor<TDefinition> =
  FunctionKindFromDefinition<TDefinition> extends never
    ? never
    : FunctionReference<
        FunctionKindFromDefinition<TDefinition>,
        FunctionArgsFromDefinition<TDefinition>,
        FunctionResultFromDefinition<TDefinition>
      >;

/**
 * Configuration object accepted by {@link query}, {@link mutation}, and
 * {@link action}.
 *
 * @typeParam TContext - The execution context injected by the runtime
 *   (`QueryCtx`, `MutationCtx`, or `ActionCtx`).
 * @typeParam TArgs - The validated argument shape after parsing.
 * @typeParam TResult - The return type of the handler.
 */
export interface FunctionConfig<TContext, TArgs, TResult> {
  /**
   * Schema that validates and types the arguments this function accepts.
   *
   * You can pass either a single `Validator` or a plain object ("validator map")
   * whose keys map to individual field validators — both forms are equivalent:
   *
   * ```ts
   * // Validator map (most common)
   * args: { title: s.string(), done: s.boolean() }
   *
   * // Single object validator (same result)
   * args: s.object({ title: s.string(), done: s.boolean() })
   * ```
   */
  args: Validator<TArgs, TArgs, string> | ValidatorMap;

  /**
   * Optional schema that validates the value returned by the handler.
   *
   * When provided, Syncore validates the return value before sending it to
   * clients. Omitting `returns` disables return-value validation but does not
   * affect the TypeScript return type inferred from the handler.
   */
  returns?: Validator<TResult, TResult, string>;

  /**
   * The function body. Receives a typed context object and the validated
   * arguments and must return (or resolve to) the function's result.
   */
  handler: (ctx: TContext, args: TArgs) => Promise<TResult> | TResult;
}

export type InferArgs<
  TArgs extends Validator<unknown, unknown, string> | ValidatorMap
> = TArgs extends Validator<unknown, unknown, string>
    ? Infer<TArgs>
    : TArgs extends ValidatorMap
      ? {
          [TKey in keyof TArgs]: Infer<TArgs[TKey]>;
        }
      : never;

function createFunctionDefinition<
  TKind extends SyncoreFunctionKind,
  TContext,
  TArgsShape extends Validator<unknown, unknown, string> | ValidatorMap,
  TResult
>(
  kind: TKind,
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<TKind, TContext, InferArgs<TArgsShape>, TResult> {
  const argsValidator = isValidator(config.args)
    ? (config.args as Validator<
        InferArgs<TArgsShape>,
        InferArgs<TArgsShape>,
        string
      >)
    : (ensureObjectValidator(config.args as ValidatorMap) as unknown as Validator<
        InferArgs<TArgsShape>,
        InferArgs<TArgsShape>,
        string
      >);

  return {
    kind,
    argsValidator,
    ...(config.returns ? { returnsValidator: config.returns } : {}),
    handler: config.handler
  };
}

/**
 * Define a Syncore query.
 *
 * Queries are the read layer of Syncore. They run inside a read-only database
 * transaction, may call other queries via `ctx.runQuery`, and are
 * **automatically reactive**: whenever a table that a query read changes,
 * every active subscription to that query is invalidated and re-executed.
 *
 * Export one query per named export in a file under `syncore/functions/`.
 * After running `npx syncorejs codegen` a typed reference will be available
 * on the generated `api` object.
 *
 * ```ts
 * // syncore/functions/tasks.ts
 * import { query } from "syncorejs";
 * import { s } from "syncorejs";
 * import type { QueryCtx } from "../_generated/server";
 *
 * export const list = query({
 *   args: { projectId: s.optional(s.id("projects")) },
 *   handler: async (ctx: QueryCtx, { projectId }) => {
 *     return ctx.db
 *       .query("tasks")
 *       .withIndex("by_project", (q) =>
 *         projectId ? q.eq("projectId", projectId) : q
 *       )
 *       .collect();
 *   },
 * });
 * ```
 *
 * @param config - The {@link FunctionConfig} describing the args schema,
 *   optional return-value schema, and handler function.
 */
export function query<
  TContext = unknown,
  TValidator extends Validator<unknown, unknown, string> = Validator<
    unknown,
    unknown,
    string
  >,
  TResult = unknown
>(
  config: FunctionConfig<TContext, Infer<TValidator>, TResult> & {
    args: TValidator;
  }
): SyncoreFunctionDefinition<"query", TContext, Infer<TValidator>, TResult>;
export function query<
  TContext = unknown,
  TArgsShape extends ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<"query", TContext, InferArgs<TArgsShape>, TResult>;
export function query<
  TContext = unknown,
  TArgsShape extends Validator<unknown, unknown, string> | ValidatorMap =
    ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<
  "query",
  TContext,
  InferArgs<TArgsShape>,
  TResult
> {
  return createFunctionDefinition("query", config);
}

/**
 * Define a Syncore mutation.
 *
 * Mutations are the write layer of Syncore. Every mutation runs inside an
 * **atomic SQLite transaction**: if the handler throws, all writes are rolled
 * back. After a successful commit Syncore automatically invalidates and
 * re-executes every active query whose read-set overlaps the changed tables.
 *
 * Mutations receive a {@link MutationCtx}, which extends the query context
 * with `ctx.db` write methods and a `ctx.scheduler` for scheduling deferred
 * work.
 *
 * ```ts
 * // syncore/functions/tasks.ts
 * import { mutation } from "syncorejs";
 * import { s } from "syncorejs";
 * import type { MutationCtx } from "../_generated/server";
 *
 * export const create = mutation({
 *   args: { title: s.string() },
 *   returns: s.id("tasks"),
 *   handler: async (ctx: MutationCtx, { title }) => {
 *     return ctx.db.insert("tasks", {
 *       title,
 *       status: "todo",
 *       projectId: null,
 *     });
 *   },
 * });
 * ```
 *
 * @param config - The {@link FunctionConfig} describing the args schema,
 *   optional return-value schema, and handler function.
 */
export function mutation<
  TContext = unknown,
  TValidator extends Validator<unknown, unknown, string> = Validator<
    unknown,
    unknown,
    string
  >,
  TResult = unknown
>(
  config: FunctionConfig<TContext, Infer<TValidator>, TResult> & {
    args: TValidator;
  }
): SyncoreFunctionDefinition<"mutation", TContext, Infer<TValidator>, TResult>;
export function mutation<
  TContext = unknown,
  TArgsShape extends ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<
  "mutation",
  TContext,
  InferArgs<TArgsShape>,
  TResult
>;
export function mutation<
  TContext = unknown,
  TArgsShape extends Validator<unknown, unknown, string> | ValidatorMap =
    ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<
  "mutation",
  TContext,
  InferArgs<TArgsShape>,
  TResult
> {
  return createFunctionDefinition("mutation", config);
}

/**
 * Define a Syncore action.
 *
 * Actions are the escape hatch for work that goes beyond reading and writing
 * the local database. They run **outside** of any transaction, which means
 * they can:
 *
 * - Call external APIs (HTTP, WebSocket, etc.)
 * - Perform CPU-intensive or long-running work
 * - Invoke other Syncore functions via `ctx.runMutation` / `ctx.runQuery`
 * - Schedule deferred jobs via `ctx.scheduler`
 *
 * Because actions are non-transactional, database writes must be delegated to
 * a mutation. This keeps write atomicity in mutations while actions handle
 * side effects.
 *
 * ```ts
 * // syncore/functions/ai.ts
 * import { action } from "syncorejs";
 * import { s } from "syncorejs";
 * import type { ActionCtx } from "../_generated/server";
 * import { api } from "../_generated/api";
 *
 * export const summarise = action({
 *   args: { taskId: s.id("tasks") },
 *   handler: async (ctx: ActionCtx, { taskId }) => {
 *     const task = await ctx.runQuery(api.tasks.get, { id: taskId });
 *     const summary = await fetchSummaryFromApi(task.title);
 *     await ctx.runMutation(api.tasks.setSummary, { taskId, summary });
 *   },
 * });
 * ```
 *
 * @param config - The {@link FunctionConfig} describing the args schema,
 *   optional return-value schema, and handler function.
 */
export function action<
  TContext = unknown,
  TValidator extends Validator<unknown, unknown, string> = Validator<
    unknown,
    unknown,
    string
  >,
  TResult = unknown
>(
  config: FunctionConfig<TContext, Infer<TValidator>, TResult> & {
    args: TValidator;
  }
): SyncoreFunctionDefinition<"action", TContext, Infer<TValidator>, TResult>;
export function action<
  TContext = unknown,
  TArgsShape extends ValidatorMap = ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<
  "action",
  TContext,
  InferArgs<TArgsShape>,
  TResult
>;
export function action<
  TContext = unknown,
  TArgsShape extends Validator<unknown, unknown, string> | ValidatorMap =
    ValidatorMap,
  TResult = unknown
>(
  config: FunctionConfig<TContext, InferArgs<TArgsShape>, TResult> & {
    args: TArgsShape;
  }
): SyncoreFunctionDefinition<
  "action",
  TContext,
  InferArgs<TArgsShape>,
  TResult
> {
  return createFunctionDefinition("action", config);
}

/**
 * Runs a recurring job repeatedly at a fixed time interval.
 *
 * At least one of `seconds`, `minutes`, or `hours` must be provided; multiple
 * fields are additive (e.g. `{ hours: 1, minutes: 30 }` fires every 90 minutes).
 *
 * ```ts
 * crons.interval("refresh-cache", { minutes: 15 }, api.cache.refresh);
 * ```
 */
export interface RecurringIntervalSchedule {
  type: "interval";
  /** Number of seconds to add to the interval. */
  seconds?: number;
  /** Number of minutes to add to the interval. */
  minutes?: number;
  /** Number of hours to add to the interval. */
  hours?: number;
}

/**
 * Runs a recurring job once a day at a specific wall-clock time.
 *
 * ```ts
 * crons.daily("nightly-report", { hour: 2, minute: 0 }, api.reports.generate);
 * ```
 */
export interface RecurringDailySchedule {
  type: "daily";
  /** Hour of day to run (0–23, in UTC unless `timezone` is provided). */
  hour: number;
  /** Minute of hour to run (0–59). */
  minute: number;
  /**
   * IANA timezone name (e.g. `"America/New_York"`). Defaults to UTC when
   * omitted.
   */
  timezone?: string;
}

/**
 * Runs a recurring job once a week on a specific day and time.
 *
 * ```ts
 * crons.weekly(
 *   "weekly-digest",
 *   { dayOfWeek: "monday", hour: 9, minute: 0, timezone: "Europe/London" },
 *   api.email.weeklyDigest
 * );
 * ```
 */
export interface RecurringWeeklySchedule {
  type: "weekly";
  /** Day of the week on which to fire. */
  dayOfWeek:
    | "sunday"
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday";
  /** Hour of day to run (0–23, in UTC unless `timezone` is provided). */
  hour: number;
  /** Minute of hour to run (0–59). */
  minute: number;
  /**
   * IANA timezone name (e.g. `"America/New_York"`). Defaults to UTC when
   * omitted.
   */
  timezone?: string;
}

/**
 * Union of all supported recurring-schedule shapes.
 *
 * Pass this (or one of its members) to {@link RecurringJobDefinition.schedule}
 * or to the fluent helpers on {@link CronJobs}.
 */
export type RecurringSchedule =
  | RecurringIntervalSchedule
  | RecurringDailySchedule
  | RecurringWeeklySchedule;

/**
 * Determines how the scheduler reacts when a job run is missed (e.g. because
 * the runtime was offline when the job was supposed to fire).
 *
 * - `"catch_up"` — Run the job once for every missed execution window. Use for
 *   jobs where every run matters (e.g. per-minute metrics collection).
 * - `"skip"` — Skip all missed runs and resume on the next scheduled tick.
 *   Safe default when running the job twice in quick succession would be
 *   harmful.
 * - `"run_once_if_missed"` — If any runs were missed, execute the job exactly
 *   once to “catch up”, then continue on the normal schedule.
 * - `"windowed"` — Catch up, but only within a specific time window. Missed
 *   runs older than `windowMs` milliseconds are discarded.
 *
 * @example
 * ```ts
 * const policy: MisfirePolicy = { type: "windowed", windowMs: 5 * 60_000 };
 * ```
 */
export type MisfirePolicy =
  | { type: "catch_up" }
  | { type: "skip" }
  | { type: "run_once_if_missed" }
  | { type: "windowed"; windowMs: number };

/**
 * A single entry in the recurring-job registry.
 *
 * You can construct these manually and pass them to `scheduler.recurringJobs`,
 * but the fluent {@link CronJobs} builder is usually more readable.
 */
export interface RecurringJobDefinition {
  /** Unique name used to identify this job in the scheduler and devtools UI. */
  name: string;
  /** When and how often this job should run. */
  schedule: RecurringSchedule;
  /** The function to invoke. Must be a mutation or action reference. */
  function: FunctionReference<"mutation" | "action">;
  /** Arguments forwarded to the function on every invocation. */
  args: Record<string, unknown>;
  /** How to handle missed executions. */
  misfirePolicy: MisfirePolicy;
}

/**
 * Fluent builder for declaring the recurring (cron) jobs of a Syncore app.
 *
 * Instantiate with {@link cronJobs} and chain calls to `.interval()`, `.daily()`,
 * or `.weekly()`. Pass the resulting instance's `.jobs` array to
 * `scheduler.recurringJobs` in your runtime options.
 *
 * ```ts
 * // syncore/crons.ts
 * import { cronJobs } from "syncorejs";
 * import { api } from "./_generated/api";
 *
 * const crons = cronJobs();
 *
 * crons.interval("refresh-feed",  { minutes: 10 }, api.feed.refresh);
 * crons.daily("send-digest",       { hour: 8, minute: 0 }, api.email.digest);
 * crons.weekly("weekly-cleanup",   { dayOfWeek: "sunday", hour: 3, minute: 0 }, api.db.vacuum);
 *
 * export default crons;
 * ```
 *
 * Then in your runtime setup:
 * ```ts
 * createNodeSyncoreRuntime({
 *   ...,
 *   scheduler: { recurringJobs: crons.jobs },
 * });
 * ```
 */
export class CronJobs {
  readonly jobs: RecurringJobDefinition[] = [];

  /**
   * Register a job that fires repeatedly at a fixed time interval.
   *
   * @param name           - Unique identifier for this job.
   * @param schedule       - Interval fields (`seconds`, `minutes`, `hours`).
   * @param functionReference - Mutation or action to invoke.
   * @param args           - Arguments forwarded on every invocation.
   * @param misfirePolicy  - How to handle runs missed while the runtime was
   *   offline. Defaults to `{ type: "catch_up" }`.
   */
  interval(
    name: string,
    schedule: Omit<RecurringIntervalSchedule, "type">,
    functionReference: FunctionReference<"mutation" | "action">,
    args: Record<string, unknown> = {},
    misfirePolicy: MisfirePolicy = { type: "catch_up" }
  ): this {
    this.jobs.push({
      name,
      schedule: { type: "interval", ...schedule },
      function: functionReference,
      args,
      misfirePolicy
    });
    return this;
  }

  /**
   * Register a job that fires once a day at a given wall-clock time.
   *
   * @param name           - Unique identifier for this job.
   * @param schedule       - `hour` (0–23), `minute` (0–59), optional `timezone`.
   * @param functionReference - Mutation or action to invoke.
   * @param args           - Arguments forwarded on every invocation.
   * @param misfirePolicy  - How to handle runs missed while the runtime was
   *   offline. Defaults to `{ type: "catch_up" }`.
   */
  daily(
    name: string,
    schedule: Omit<RecurringDailySchedule, "type">,
    functionReference: FunctionReference<"mutation" | "action">,
    args: Record<string, unknown> = {},
    misfirePolicy: MisfirePolicy = { type: "catch_up" }
  ): this {
    this.jobs.push({
      name,
      schedule: { type: "daily", ...schedule },
      function: functionReference,
      args,
      misfirePolicy
    });
    return this;
  }

  /**
   * Register a job that fires once a week on a given day and time.
   *
   * @param name           - Unique identifier for this job.
   * @param schedule       - `dayOfWeek`, `hour` (0–23), `minute` (0–59),
   *   optional `timezone`.
   * @param functionReference - Mutation or action to invoke.
   * @param args           - Arguments forwarded on every invocation.
   * @param misfirePolicy  - How to handle runs missed while the runtime was
   *   offline. Defaults to `{ type: "catch_up" }`.
   */
  weekly(
    name: string,
    schedule: Omit<RecurringWeeklySchedule, "type">,
    functionReference: FunctionReference<"mutation" | "action">,
    args: Record<string, unknown> = {},
    misfirePolicy: MisfirePolicy = { type: "catch_up" }
  ): this {
    this.jobs.push({
      name,
      schedule: { type: "weekly", ...schedule },
      function: functionReference,
      args,
      misfirePolicy
    });
    return this;
  }
}

/**
 * Create a new {@link CronJobs} builder for declaring recurring Syncore jobs.
 *
 * @example
 * ```ts
 * // syncore/crons.ts
 * import { cronJobs } from "syncorejs";
 * import { api } from "./_generated/api";
 *
 * const crons = cronJobs();
 * crons.interval("sync", { minutes: 5 }, api.sync.run);
 * export default crons;
 * ```
 */
export function cronJobs(): CronJobs {
  return new CronJobs();
}
