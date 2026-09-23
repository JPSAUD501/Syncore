import type {
  CapabilityDescriptor,
  DevtoolsLiveQueryScope,
  QueryCtx,
  SyncoreDataModel,
  SyncoreResolvedComponents,
  SyncoreCapabilities,
  SyncoreClient,
  SyncoreRuntimeCapabilities,
  SyncoreRuntime,
  SyncoreRuntimeAdmin,
  SyncoreRuntimeOptions,
  SyncoreWatch,
  UpdateScheduledJobOptions
} from "../runtime.js";
import type { FunctionReference } from "../functions.js";
import type {
  SyncoreDevtoolsEvent,
  SyncoreDevtoolsEventOrigin
} from "@syncore/devtools-protocol";
import { generateId } from "../id.js";
import { DevtoolsEngine } from "./engines/devtoolsEngine.js";
import { ExecutionEngine } from "./engines/executionEngine.js";
import { ReactivityEngine } from "./engines/reactivityEngine.js";
import { SchedulerEngine } from "./engines/schedulerEngine.js";
import { SchemaEngine } from "./engines/schemaEngine.js";
import { StorageEngine } from "./engines/storageEngine.js";
import { inferDriverDatabasePath } from "./engines/shared.js";
import { TransactionCoordinator } from "./transactionCoordinator.js";
import { ensureSupportedSystemFormats } from "./systemMeta.js";
import { RuntimeStatusController } from "./runtimeStatus.js";

type DevtoolsEventMeta = {
  origin?: SyncoreDevtoolsEventOrigin;
  executionId?: string;
  parentExecutionId?: string;
  schedulerJobId?: string;
  schedulerRun?: boolean;
};

export class RuntimeKernel<TSchema extends SyncoreDataModel> {
  readonly runtimeId = generateId();
  readonly platform: string;
  readonly externalChangeSourceId = generateId();
  readonly driverDatabasePath: string | undefined;
  readonly capabilities: Readonly<SyncoreCapabilities>;
  readonly runtimeCapabilities: Readonly<SyncoreRuntimeCapabilities>;
  readonly capabilityDescriptors: ReadonlyArray<CapabilityDescriptor>;
  readonly devtoolsEngine: DevtoolsEngine;
  readonly schemaEngine: SchemaEngine<TSchema>;
  readonly storageEngine: StorageEngine;
  readonly schedulerEngine: SchedulerEngine;
  readonly reactivityEngine: ReactivityEngine;
  readonly executionEngine: ExecutionEngine<TSchema>;
  readonly transactionCoordinator: TransactionCoordinator;
  readonly runtimeStatus: RuntimeStatusController;
  readonly admin: SyncoreRuntimeAdmin<TSchema>;
  private prepared = false;
  private preparing: Promise<void> | undefined;
  private started = false;

  constructor(
    private readonly options: SyncoreRuntimeOptions<TSchema>,
    runtime: SyncoreRuntime<TSchema>
  ) {
    this.platform = options.platform ?? "node";
    this.capabilityDescriptors = Object.freeze([
      ...(options.capabilityDescriptors ?? [])
    ]);
    this.capabilities = Object.freeze({
      ...(options.capabilities ?? {})
    });
    this.runtimeCapabilities = Object.freeze(
      options.runtimeCapabilities ?? {
        storage: {
          available: true,
          ...(options.storage.supportsRange
            ? { supportsRange: options.storage.supportsRange() !== false }
            : {})
        }
      }
    );
    this.driverDatabasePath = inferDriverDatabasePath(
      options.driver as { filename?: string; databasePath?: string }
    );
    this.devtoolsEngine = new DevtoolsEngine({
      runtimeId: this.runtimeId,
      platform: this.platform,
      ...(options.devtools ? { sink: options.devtools } : {}),
      getActiveQueryInfos: () => this.reactivityEngine.getActiveQueryInfos(),
      getSchemaTables: () => this.schemaEngine.getSchemaTablesForDevtools()
    });
    this.schemaEngine = new SchemaEngine({
      schema: options.schema,
      driver: options.driver,
      runtimeId: this.runtimeId,
      devtools: this.devtoolsEngine
    });
    this.storageEngine = new StorageEngine({
      driver: options.driver,
      storage: options.storage,
      runtimeId: this.runtimeId,
      devtools: this.devtoolsEngine
    });
    this.transactionCoordinator = new TransactionCoordinator(options.driver);
    this.runtimeStatus = new RuntimeStatusController({
      kind: "starting",
      reason: "booting",
      capabilities: this.runtimeCapabilities
    });
    this.schedulerEngine = new SchedulerEngine({
      driver: options.driver,
      runtimeId: this.runtimeId,
      devtools: this.devtoolsEngine,
      recurringJobs: options.scheduler?.recurringJobs ?? [],
      pollIntervalMs: options.scheduler?.pollIntervalMs ?? 1000,
      runMutation: (reference, args, meta) =>
        this.executionEngine.runMutation(reference, args, meta),
      runAction: (reference, args, meta) =>
        this.executionEngine.runAction(reference, args, meta)
    });
    this.reactivityEngine = new ReactivityEngine({
      runtimeId: this.runtimeId,
      externalChangeSourceId: this.externalChangeSourceId,
      ...(options.externalChangeSignal
        ? { externalChangeSignal: options.externalChangeSignal }
        : {}),
      ...(options.externalChangeApplier
        ? { externalChangeApplier: options.externalChangeApplier }
        : {}),
      devtools: this.devtoolsEngine,
      runQuery: (reference, args, meta) =>
        this.executionEngine.runQuery(reference, args, meta),
      collectQueryDependencies: (functionName, args) =>
        this.executionEngine.collectQueryDependencies(functionName, args)
    });
    this.executionEngine = new ExecutionEngine({
      runtimeId: this.runtimeId,
      functions: options.functions,
      driver: options.driver,
      capabilities: this.capabilities,
      capabilityDescriptors: this.capabilityDescriptors,
      schema: this.schemaEngine,
      storage: this.storageEngine,
      scheduler: this.schedulerEngine,
      reactivity: this.reactivityEngine,
      devtools: this.devtoolsEngine,
      transactionCoordinator: this.transactionCoordinator,
      runtimeStatus: this.runtimeStatus
    });
    this.admin = {
      prepareForDirectAccess: () => this.prepareForDirectAccess(),
      createClient: () => this.createClient(),
      runQuery: (reference, args, meta) =>
        this.executionEngine.runQuery(reference, args, meta),
      runMutation: (reference, args, meta) =>
        this.executionEngine.runMutation(reference, args, meta),
      runAction: (reference, args, meta) =>
        this.executionEngine.runAction(reference, args, meta),
      runDevtoolsMutation: async (callback, meta) => {
        await this.prepareForDirectAccess();
        return this.executionEngine.runDevtoolsMutation(callback, meta);
      },
      getRuntimeSummary: () => this.devtoolsEngine.getRuntimeSummary(),
      getActiveQueryInfos: () => this.reactivityEngine.getActiveQueryInfos(),
      getRuntimeId: () => this.runtimeId,
      getDriverDatabasePath: () => this.driverDatabasePath,
      subscribeToDevtoolsEvents: (listener) =>
        this.devtoolsEngine.subscribeEvents(listener),
      subscribeToDevtoolsInvalidations: (listener) =>
        this.devtoolsEngine.subscribeInvalidations(listener),
      notifyDevtoolsScopes: (scopes) =>
        this.devtoolsEngine.notifyScopes(scopes),
      forceRefreshDevtools: async (reason, scopes, meta) => {
        const resolvedScopes = new Set(scopes ?? []);
        if (resolvedScopes.size > 0) {
          await this.reactivityEngine.refreshQueriesForScopes(
            resolvedScopes,
            reason
          );
        }
        await this.devtoolsEngine.forceRefresh(
          reason,
          {
            refreshQueriesForScopes: (requestedScopes, refreshReason) =>
              this.reactivityEngine.refreshQueriesForScopes(
                requestedScopes,
                refreshReason
              )
          },
          meta,
          resolvedScopes
        );
      },
      listStorageObjects: async (options) => {
        await this.prepareForDirectAccess();
        return this.storageEngine.listObjects(options);
      },
      getStorageObjectAccessInfo: async (id) => {
        await this.prepareForDirectAccess();
        return this.storageEngine.getObjectAccessInfo(id);
      },
      readStorageObjectRange: async (id, offset, length) => {
        await this.prepareForDirectAccess();
        return this.storageEngine.readObjectRange(id, offset, length);
      },
      deleteStorageObject: async (id, meta) => {
        await this.prepareForDirectAccess();
        const deleted = await this.storageEngine.deleteObject(id, meta);
        if (deleted) {
          this.devtoolsEngine.notifyScopes([
            "runtime.summary",
            "storage.objects",
            `storage:${id}`
          ]);
        }
        return deleted;
      },
      cancelScheduledJob: async (id) => {
        await this.prepareForDirectAccess();
        return this.schedulerEngine.cancelScheduledJob(id);
      },
      updateScheduledJob: async (update: UpdateScheduledJobOptions) => {
        await this.prepareForDirectAccess();
        return this.schedulerEngine.updateScheduledJob(update);
      },
      runScheduledJobs: async (runOptions) => {
        await this.prepareForDirectAccess();
        return this.schedulerEngine.runDueJobs(runOptions);
      }
    };
    options.devtools?.attachRuntime?.(runtime);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.runtimeStatus.setStatus({
      kind: "starting",
      reason: "booting",
      capabilities: this.runtimeCapabilities
    });
    try {
      await this.prepareForDirectAccess();
    } catch (error) {
      this.runtimeStatus.setStatus({
        kind: "error",
        reason: "runtime-unavailable",
        capabilities: this.runtimeCapabilities,
        ...(error instanceof Error ? { error } : {})
      });
      throw error;
    }
    try {
      await this.runComponentHooks("onStart");
      this.reactivityEngine.start();
      if (this.options.scheduler?.autoRun ?? true) {
        this.schedulerEngine.startPolling();
      }
      this.started = true;
      this.runtimeStatus.setStatus({
        kind: "ready",
        capabilities: this.runtimeCapabilities
      });
      this.devtoolsEngine.emit({
        type: "runtime.connected",
        runtimeId: this.runtimeId,
        platform: this.platform,
        timestamp: Date.now()
      });
    } catch (error) {
      this.schedulerEngine.stopPolling();
      this.reactivityEngine.stop();
      await this.options.driver.close?.().catch(() => undefined);
      this.started = false;
      this.runtimeStatus.setStatus({
        kind: "error",
        reason: "runtime-unavailable",
        capabilities: this.runtimeCapabilities,
        ...(error instanceof Error ? { error } : {})
      });
      throw error;
    }
  }

  /**
   * Creates system tables, applies the schema and syncs recurring jobs. Runs
   * once, however many callers ask concurrently; a failed attempt can be
   * retried.
   */
  prepareForDirectAccess(): Promise<void> {
    if (this.prepared) {
      return Promise.resolve();
    }
    this.preparing ??= this.prepare().then(
      () => {
        this.prepared = true;
      },
      (error: unknown) => {
        this.preparing = undefined;
        throw error;
      }
    );
    return this.preparing;
  }

  private async prepare(): Promise<void> {
    // One transaction: a single commit instead of one per statement, and a
    // failed boot (e.g. a destructive schema change) leaves nothing behind.
    await this.options.driver.withTransaction(async () => {
      await ensureSupportedSystemFormats(this.options.driver);
      await this.schemaEngine.prepare();
      await this.storageEngine.prepare();
      await this.schedulerEngine.prepare();
      await this.schemaEngine.applySchema();
      await this.schedulerEngine.syncRecurringJobs();
    });
    // Touches the storage adapter (files), so it runs after the commit.
    await this.storageEngine.reconcile();
  }

  async stop(): Promise<void> {
    this.schedulerEngine.stopPolling();
    // Let a job that is running finish before the driver closes under it.
    await this.schedulerEngine.whenIdle();
    let stopError: unknown;
    if (this.started) {
      try {
        await this.runComponentHooks("onStop");
      } catch (error) {
        stopError = error;
      }
    }
    this.reactivityEngine.stop();
    await this.options.driver.close?.();
    if (this.started) {
      this.devtoolsEngine.emit({
        type: "runtime.disconnected",
        runtimeId: this.runtimeId,
        timestamp: Date.now()
      });
    }
    this.started = false;
    this.runtimeStatus.setStatus({
      kind: "unavailable",
      reason: "disposed",
      capabilities: this.runtimeCapabilities
    });
    if (stopError) {
      throw stopError;
    }
  }

  createClient(): SyncoreClient {
    return this.executionEngine.createClient();
  }

  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: Record<string, unknown> = {}
  ): SyncoreWatch<TResult> {
    return this.executionEngine.watchQuery(reference, args);
  }

  private async runComponentHooks(hook: "onStart" | "onStop"): Promise<void> {
    for (const component of this.options.components ?? []) {
      await this.runComponentHookTree(component, hook);
    }
  }

  private async runComponentHookTree(
    component: SyncoreResolvedComponents[number],
    hook: "onStart" | "onStop"
  ): Promise<void> {
    const handler = component[hook];
    if (handler) {
      await handler({
        runtimeId: this.runtimeId,
        platform: this.platform,
        componentPath: component.path,
        componentName: component.name,
        version: component.version,
        config: component.config,
        capabilities: component.grantedCapabilities,
        emitDevtools: (event: SyncoreDevtoolsEvent) => {
          this.devtoolsEngine.emit(event);
        }
      });
    }
    for (const child of component.children) {
      await this.runComponentHookTree(child, hook);
    }
  }
}
