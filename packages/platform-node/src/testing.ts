/**
 * Test helpers for Syncore apps.
 *
 * `createTestSyncore` boots a real Syncore runtime on an in-memory SQLite
 * database with in-memory storage, no devtools connection and a scheduler that
 * only runs when you ask it to. Each harness is isolated, so tests can run in
 * parallel without sharing state.
 *
 * ```ts
 * import { createTestSyncore } from "syncorejs/testing";
 * import schema from "../syncore/schema";
 * import { functions } from "../syncore/_generated/functions";
 * import { api } from "../syncore/_generated/api";
 *
 * const t = await createTestSyncore({ schema, functions });
 * await t.mutation(api.tasks.create, { text: "Write tests" });
 * expect(await t.query(api.tasks.list)).toHaveLength(1);
 * await t.dispose();
 * ```
 *
 * The helpers do not depend on a specific test runner.
 */
import {
  createFunctionReference,
  mutation,
  s,
  SyncoreRuntime,
  type MutationCtx,
  type RecurringJobDefinition,
  type RunScheduledJobsOptions,
  type RunScheduledJobsResult,
  type StorageObject,
  type StorageWriteInput,
  type SyncoreCapabilities,
  type SyncoreClient,
  type SyncoreDataModel,
  type SyncoreFunctionRegistry,
  type SyncoreResolvedComponents,
  type SyncoreStorageAdapter
} from "@syncore/core";
import { NodeSqliteDriver } from "./index.js";

const RUN_FUNCTION_NAME = "__syncore_test__/run";

/**
 * Options for {@link createTestSyncore}.
 */
export interface CreateTestSyncoreOptions<TSchema extends SyncoreDataModel> {
  /** The app schema, usually the default export of `syncore/schema.ts`. */
  schema: TSchema;
  /** The generated `functions` export from `syncore/_generated/functions.ts`. */
  functions: SyncoreFunctionRegistry;
  /** Resolved components, when the app installs Syncore components. */
  components?: SyncoreResolvedComponents;
  /** Values exposed to handlers as `ctx.capabilities`. */
  capabilities?: SyncoreCapabilities;
  /**
   * Recurring jobs to register. They only run when you call
   * {@link TestSyncore.runScheduledJobs}.
   */
  recurringJobs?: RecurringJobDefinition[];
}

/**
 * Options for {@link TestSyncore.finishScheduledJobs}.
 */
export interface FinishScheduledJobsOptions {
  /**
   * How many passes to make before giving up, so a job that keeps scheduling
   * itself fails the test instead of hanging it. Defaults to `100`.
   */
  maxIterations?: number;
}

/**
 * A Syncore runtime prepared for tests. Created by {@link createTestSyncore}.
 */
export interface TestSyncore<TSchema extends SyncoreDataModel>
  extends AsyncDisposable {
  /** Calls a query, like `client.query`. */
  query: SyncoreClient["query"];
  /** Calls a mutation, like `client.mutation`. */
  mutation: SyncoreClient["mutation"];
  /** Calls an action, like `client.action`. */
  action: SyncoreClient["action"];
  /** The client used by `query`, `mutation` and `action`. */
  client: SyncoreClient;
  /** The underlying runtime, for anything the helpers do not cover. */
  runtime: SyncoreRuntime<TSchema>;
  /**
   * Runs `callback` inside a mutation, with full read-write access to
   * `ctx.db`, `ctx.storage` and `ctx.scheduler`. Use it to seed data or to
   * inspect tables that no function exposes.
   */
  run<TResult>(
    callback: (ctx: MutationCtx<TSchema>) => Promise<TResult> | TResult
  ): Promise<TResult>;
  /**
   * Runs the scheduled jobs that are due now. Works with fake timers: set the
   * clock forward first and the jobs that became due will run.
   */
  runScheduledJobs(
    options?: RunScheduledJobsOptions
  ): Promise<RunScheduledJobsResult>;
  /**
   * Runs every pending one-off job, including jobs scheduled for later and
   * jobs those jobs schedule, until none are left. Recurring jobs are not
   * run.
   */
  finishScheduledJobs(
    options?: FinishScheduledJobsOptions
  ): Promise<RunScheduledJobsResult>;
  /** Stops the runtime and frees the in-memory database. */
  dispose(): Promise<void>;
}

/**
 * Starts an isolated Syncore runtime for a test.
 *
 * @param options - The schema and functions to run. See
 *   {@link CreateTestSyncoreOptions}.
 * @returns A started {@link TestSyncore}. Call `dispose()` when the test ends,
 *   or declare it with `await using`.
 */
export async function createTestSyncore<TSchema extends SyncoreDataModel>(
  options: CreateTestSyncoreOptions<TSchema>
): Promise<TestSyncore<TSchema>> {
  if (options.functions[RUN_FUNCTION_NAME]) {
    throw new Error(`"${RUN_FUNCTION_NAME}" is reserved by createTestSyncore.`);
  }

  // `run` callbacks are not serializable, so the synthetic mutation receives a
  // token and looks the callback up here.
  const pendingRuns = new Map<
    string,
    (ctx: MutationCtx<TSchema>) => Promise<unknown> | unknown
  >();
  const runResults = new Map<string, unknown>();
  let nextRunToken = 0;

  const runtime = new SyncoreRuntime({
    schema: options.schema,
    functions: {
      ...options.functions,
      [RUN_FUNCTION_NAME]: mutation({
        args: { token: s.string() },
        handler: async (ctx: MutationCtx<TSchema>, args: { token: string }) => {
          const callback = pendingRuns.get(args.token);
          if (!callback) {
            throw new Error(`Unknown test run "${args.token}".`);
          }
          runResults.set(args.token, await callback(ctx));
          return null;
        }
      })
    },
    ...(options.components ? { components: options.components } : {}),
    ...(options.capabilities ? { capabilities: options.capabilities } : {}),
    driver: new NodeSqliteDriver(":memory:"),
    storage: new InMemoryStorageAdapter(),
    platform: "node-test",
    scheduler: {
      autoRun: false,
      ...(options.recurringJobs ? { recurringJobs: options.recurringJobs } : {})
    }
  });
  await runtime.start();

  const client = runtime.createClient();
  const admin = runtime.getAdmin();
  const runReference = createFunctionReference<
    "mutation",
    { token: string },
    null
  >("mutation", RUN_FUNCTION_NAME);
  let disposed = false;

  const dispose = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    await runtime.stop();
  };

  return {
    query: client.query.bind(client),
    mutation: client.mutation.bind(client),
    action: client.action.bind(client),
    client,
    runtime,
    async run(callback) {
      const token = String(nextRunToken++);
      pendingRuns.set(token, callback);
      try {
        await client.mutation(runReference, { token });
        return runResults.get(token) as Awaited<ReturnType<typeof callback>>;
      } finally {
        pendingRuns.delete(token);
        runResults.delete(token);
      }
    },
    runScheduledJobs: (runOptions) => admin.runScheduledJobs(runOptions),
    async finishScheduledJobs(finishOptions = {}) {
      const maxIterations = finishOptions.maxIterations ?? 100;
      const total = { executed: 0, failed: 0 };
      for (let iteration = 0; iteration < maxIterations; iteration += 1) {
        const pass = await admin.runScheduledJobs({
          includeFuture: true,
          includeRecurring: false
        });
        if (pass.executed === 0 && pass.failed === 0) {
          return total;
        }
        total.executed += pass.executed;
        total.failed += pass.failed;
      }
      throw new Error(
        `Scheduled jobs were still pending after ${maxIterations} passes. ` +
          "A job is probably scheduling itself; raise maxIterations or run " +
          "the jobs one pass at a time with runScheduledJobs()."
      );
    },
    dispose,
    [Symbol.asyncDispose]: dispose
  };
}

/**
 * Storage adapter that keeps objects in memory. Used by
 * {@link createTestSyncore}; also handy for custom test setups.
 */
export class InMemoryStorageAdapter implements SyncoreStorageAdapter {
  private readonly objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string | null }
  >();

  async put(id: string, input: StorageWriteInput): Promise<StorageObject> {
    const bytes = toBytes(input.data);
    const contentType = input.contentType ?? null;
    this.objects.set(id, { bytes, contentType });
    return this.describe(id, bytes, contentType);
  }

  async get(id: string): Promise<StorageObject | null> {
    const entry = this.objects.get(id);
    return entry ? this.describe(id, entry.bytes, entry.contentType) : null;
  }

  async read(id: string): Promise<Uint8Array | null> {
    const entry = this.objects.get(id);
    return entry ? entry.bytes.slice() : null;
  }

  async readRange(
    id: string,
    offset: number,
    length: number
  ): Promise<Uint8Array | null> {
    const entry = this.objects.get(id);
    if (!entry) {
      return null;
    }
    const start = Math.max(offset, 0);
    return entry.bytes.slice(start, start + Math.max(length, 0));
  }

  async delete(id: string): Promise<void> {
    this.objects.delete(id);
  }

  async list(): Promise<StorageObject[]> {
    return [...this.objects].map(([id, entry]) =>
      this.describe(id, entry.bytes, entry.contentType)
    );
  }

  private describe(
    id: string,
    bytes: Uint8Array,
    contentType: string | null
  ): StorageObject {
    return { id, path: `memory://${id}`, size: bytes.byteLength, contentType };
  }
}

function toBytes(data: StorageWriteInput["data"]): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data.slice();
  }
  return new Uint8Array(data.slice(0));
}
