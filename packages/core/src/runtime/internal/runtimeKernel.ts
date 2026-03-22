import type {
  AnySyncoreSchema,
  CapabilityDescriptor,
  DevtoolsLiveQueryScope,
  QueryCtx,
  SyncoreResolvedComponents,
  SyncoreCapabilities,
  SyncoreClient,
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
};

export class RuntimeKernel<TSchema extends AnySyncoreSchema> {
  readonly runtimeId = generateId();
  readonly platform: string;
  readonly externalChangeSourceId = generateId();
  readonly driverDatabasePath: string | undefined;
  readonly capabilities: Readonly<SyncoreCapabilities>;
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
  private started = false;

  constructor(
    private readonly options: SyncoreRuntimeOptions<TSchema>,
    runtime: SyncoreRuntime<AnySyncoreSchema>
  ) {
    this.platform = options.platform ?? "node";
    this.capabilityDescriptors = Object.freeze([
      ...(options.capabilityDescriptors ?? [])
    ]);
    this.capabilities = Object.freeze({
      ...(options.capabilities ?? {})
    });
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
      reason: "booting"
    });
    this.schedulerEngine = new SchedulerEngine({
      driver: options.driver,
      runtimeId: this.runtimeId,
      devtools: this.devtoolsEngine,
      recurringJobs: options.scheduler?.recurringJobs ?? [],
      pollIntervalMs: options.scheduler?.pollIntervalMs ?? 1000,
      runMutation: (reference, args) =>
        this.executionEngine.runMutation(reference, args),
      runAction: (reference, args) => this.executionEngine.runAction(reference, args)
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
      runQuery: (reference, args) => this.executionEngine.runQuery(reference, args),
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
      notifyDevtoolsScopes: (scopes) => this.devtoolsEngine.notifyScopes(scopes),
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
      cancelScheduledJob: async (id) => {
        await this.prepareForDirectAccess();
        return this.schedulerEngine.cancelScheduledJob(id);
      },
      updateScheduledJob: async (update: UpdateScheduledJobOptions) => {
        await this.prepareForDirectAccess();
        return this.schedulerEngine.updateScheduledJob(update);
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
      reason: "booting"
    });
    await this.prepareForDirectAccess();
    try {
      await this.runComponentHooks("onStart");
      this.reactivityEngine.start();
      this.schedulerEngine.startPolling();
      this.started = true;
      this.runtimeStatus.setStatus({
        kind: "ready"
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
        ...(error instanceof Error ? { error } : {})
      });
      throw error;
    }
  }

  async prepareForDirectAccess(): Promise<void> {
    if (this.prepared) {
      return;
    }
    await ensureSupportedSystemFormats(this.options.driver);
    await this.schemaEngine.prepare();
    await this.storageEngine.prepare();
    await this.schedulerEngine.prepare();
    await this.storageEngine.reconcile();
    await this.schemaEngine.applySchema();
    await this.schedulerEngine.syncRecurringJobs();
    this.prepared = true;
  }

  async stop(): Promise<void> {
    this.schedulerEngine.stopPolling();
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
      reason: "disposed"
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

  private async runComponentHooks(
    hook: "onStart" | "onStop"
  ): Promise<void> {
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
