import type {
  ExecutionResult,
  JsonObject,
  SyncoreSqlDriver
} from "../runtime.js";
import type { SyncoreExternalChangeReason } from "../runtime.js";

export interface TransactionState {
  changedTables: Set<string>;
  storageChanges: Array<{
    storageId: string;
    reason: Extract<SyncoreExternalChangeReason, "storage-put" | "storage-delete">;
  }>;
}

export class TransactionCoordinator {
  constructor(private readonly driver: SyncoreSqlDriver) {}

  async runInTransaction<TResult>(
    execute: (state: TransactionState) => Promise<TResult>
  ): Promise<ExecutionResult<TResult>> {
    const state = this.createState();
    const result = await this.driver.withTransaction(async () => execute(state));
    return {
      result,
      changedTables: state.changedTables,
      storageChanges: state.storageChanges,
      scheduledJobs: [],
      devtoolsEvents: [],
      externalChangeRequests: []
    };
  }

  createState(): TransactionState {
    return {
      changedTables: new Set<string>(),
      storageChanges: []
    };
  }
}

export function createEmptyExecutionResult<TResult>(
  result: TResult,
  state?: Partial<TransactionState>
): ExecutionResult<TResult> {
  return {
    result,
    changedTables: state?.changedTables ?? new Set<string>(),
    storageChanges: state?.storageChanges ?? [],
    scheduledJobs: [],
    devtoolsEvents: [],
    externalChangeRequests: []
  };
}
