import type {
  SyncoreActiveQueryInfo,
  SyncoreDevtoolsEvent
} from "@syncore/devtools-protocol";
import type { FunctionReference } from "../../functions.js";
import type {
  ImpactScope,
  JsonObject,
  SyncoreExternalChangeApplier,
  SyncoreExternalChangeEvent,
  SyncoreExternalChangeSignal,
  SyncoreWatch
} from "../../runtime.js";
import { DevtoolsEngine } from "./devtoolsEngine.js";
import type {
  ActiveQueryRecord,
  DependencyKey
} from "./shared.js";

type ReactivityEngineDeps = {
  runtimeId: string;
  externalChangeSourceId: string;
  externalChangeSignal?: SyncoreExternalChangeSignal;
  externalChangeApplier?: SyncoreExternalChangeApplier;
  devtools: DevtoolsEngine;
  runQuery: <TResult>(
    reference: FunctionReference<"query", unknown, TResult>,
    args: JsonObject
  ) => Promise<TResult>;
  collectQueryDependencies: (
    functionName: string,
    args: JsonObject
  ) => Promise<Set<DependencyKey>>;
};

export class ReactivityEngine {
  private readonly activeQueries = new Map<string, ActiveQueryRecord>();
  private detachExternalChangeListener: (() => void) | undefined;
  private pendingExternalChangePromise: Promise<void> | undefined;
  private queuedExternalChange:
    | {
        changedScopes: Set<ImpactScope>;
      }
    | undefined;

  constructor(private readonly deps: ReactivityEngineDeps) {}

  start(): void {
    this.detachExternalChangeListener =
      this.deps.externalChangeSignal?.subscribe((event) => {
        void this.handleExternalChangeEvent(event);
      });
  }

  stop(): void {
    this.detachExternalChangeListener?.();
    this.detachExternalChangeListener = undefined;
  }

  getActiveQueryInfos(): SyncoreActiveQueryInfo[] {
    return [...this.activeQueries.values()].map((query) => ({
      id: query.id,
      functionName: query.functionName,
      dependencyKeys: [...query.dependencyKeys],
      lastRunAt: query.lastRunAt
    }));
  }

  watchQuery<TArgs, TResult>(
    reference: FunctionReference<"query", TArgs, TResult>,
    args: JsonObject = {}
  ): SyncoreWatch<TResult> {
    const key = this.createActiveQueryKey(reference.name, args);
    let record = this.activeQueries.get(key);

    if (!record) {
      record = {
        id: key,
        functionName: reference.name,
        args,
        listeners: new Set<() => void>(),
        consumers: 0,
        dependencyKeys: new Set<DependencyKey>(),
        lastResult: undefined,
        lastError: undefined,
        lastRunAt: 0
      };
      this.activeQueries.set(key, record);
      void this.rerunActiveQuery(record);
    }

    const activeRecord = record;
    activeRecord.consumers += 1;
    let disposed = false;
    const ownedListeners = new Set<() => void>();

    return {
      onUpdate: (callback) => {
        activeRecord.listeners.add(callback);
        ownedListeners.add(callback);
        queueMicrotask(callback);
        return () => {
          activeRecord.listeners.delete(callback);
          ownedListeners.delete(callback);
        };
      },
      localQueryResult: () => activeRecord.lastResult as TResult | undefined,
      localQueryError: () => activeRecord.lastError,
      dispose: () => {
        if (disposed) {
          return;
        }
        disposed = true;
        for (const callback of ownedListeners) {
          activeRecord.listeners.delete(callback);
        }
        ownedListeners.clear();
        activeRecord.consumers = Math.max(0, activeRecord.consumers - 1);
        if (activeRecord.consumers === 0) {
          this.activeQueries.delete(key);
        }
      }
    };
  }

  async refreshInvalidatedQueries(
    changedTables: Set<string>,
    mutationId: string
  ): Promise<void> {
    const impactedScopes = new Set(
      [...changedTables].map((tableName) => `table:${tableName}` as ImpactScope)
    );
    await this.refreshQueriesForScopes(
      impactedScopes,
      `Mutation ${mutationId} changed ${[...changedTables].join(", ")}`
    );
  }

  async refreshQueriesForScopes(
    scopes: Iterable<ImpactScope>,
    reason: string
  ): Promise<void> {
    const scopeSet = new Set(scopes);
    if (scopeSet.size === 0) {
      return;
    }
    for (const query of this.activeQueries.values()) {
      const needsRefresh = [...scopeSet].some((scope) =>
        query.dependencyKeys.has(scope)
      );
      if (!needsRefresh) {
        continue;
      }
      this.deps.devtools.emit({
        type: "query.invalidated",
        runtimeId: this.deps.runtimeId,
        queryId: query.id,
        reason,
        timestamp: Date.now()
      });
      await this.rerunActiveQuery(query);
    }
  }

  async publishExternalChange(
    event: Omit<SyncoreExternalChangeEvent, "sourceId" | "timestamp">
  ): Promise<void> {
    const changedScopes = resolveChangedScopes(event);
    if (changedScopes.size === 0) {
      throw new Error(
        `Syncore cannot publish external change "${event.reason}" without precise impact scopes.`
      );
    }
    await this.deps.externalChangeSignal?.publish({
      ...event,
      changedScopes: [...changedScopes],
      sourceId: this.deps.externalChangeSourceId,
      timestamp: Date.now()
    });
  }

  async publishStorageChanges(
    storageChanges: Array<{
      storageId: string;
      reason: "storage-put" | "storage-delete";
    }>
  ): Promise<void> {
    for (const change of storageChanges) {
      await this.publishExternalChange({
        scope: "storage",
        reason: change.reason,
        changedScopes: [`storage:${change.storageId}`],
        storageIds: [change.storageId]
      });
    }
  }

  async publishDatabaseReconcile(): Promise<void> {
    throw new Error(
      "Syncore database reconcile without precise impact scopes is unsupported."
    );
  }

  private async rerunActiveQuery(record: ActiveQueryRecord): Promise<void> {
    record.dependencyKeys.clear();
    try {
      const result = await this.deps.runQuery(
        { kind: "query", name: record.functionName },
        record.args
      );
      record.lastResult = result;
      record.lastError = undefined;
      record.lastRunAt = Date.now();
      record.dependencyKeys = await this.deps.collectQueryDependencies(
        record.functionName,
        record.args
      );
    } catch (error) {
      record.lastError = error as Error;
    }
    for (const listener of record.listeners) {
      listener();
    }
  }

  private async handleExternalChangeEvent(
    event: SyncoreExternalChangeEvent
  ): Promise<void> {
    if (event.sourceId === this.deps.externalChangeSourceId) {
      return;
    }
    const result = this.deps.externalChangeApplier
      ? await this.deps.externalChangeApplier.applyExternalChange(event)
      : {
          databaseChanged: event.scope === "database" || event.scope === "all",
          storageChanged: event.scope === "storage" || event.scope === "all",
          changedScopes: [...resolveChangedScopes(event)]
        };
    await this.processExternalChangeResult(result);
  }

  private async processExternalChangeResult(result: {
    changedScopes: ImpactScope[];
  }): Promise<void> {
    const changedScopes = new Set(result.changedScopes);
    if (changedScopes.size === 0) {
      return;
    }
    if (this.pendingExternalChangePromise) {
      this.queuedExternalChange = {
        changedScopes: new Set([
          ...(this.queuedExternalChange?.changedScopes ?? []),
          ...changedScopes
        ])
      };
      return this.pendingExternalChangePromise;
    }

    this.pendingExternalChangePromise = (async () => {
      await this.refreshQueriesForScopes(
        changedScopes,
        `External change touched ${[...changedScopes].join(", ")}`
      );
    })();

    try {
      await this.pendingExternalChangePromise;
    } finally {
      this.pendingExternalChangePromise = undefined;
      const queued = this.queuedExternalChange;
      this.queuedExternalChange = undefined;
      if (queued) {
        await this.processExternalChangeResult({
          changedScopes: [...queued.changedScopes]
        });
      }
    }
  }

  private createActiveQueryKey(name: string, args: JsonObject): string {
    return `${name}:${stableStringify(args)}`;
  }
}

function resolveChangedScopes(
  event: Pick<
    SyncoreExternalChangeEvent,
    "scope" | "changedScopes" | "changedTables" | "storageIds"
  >
): Set<ImpactScope> {
  if (Array.isArray(event.changedScopes) && event.changedScopes.length > 0) {
    return new Set(event.changedScopes);
  }

  const scopes = new Set<ImpactScope>();
  for (const tableName of event.changedTables ?? []) {
    scopes.add(`table:${tableName}`);
  }
  for (const storageId of event.storageIds ?? []) {
    scopes.add(`storage:${storageId}`);
  }

  if (scopes.size === 0 && event.scope !== undefined) {
    throw new Error(
      `Syncore external change scope "${event.scope}" did not provide precise impact scopes.`
    );
  }

  return scopes;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)])
    );
  }
  return value;
}
