import type {
  SyncoreRuntimeStatus,
  SyncoreWatch
} from "../runtime.js";

export class RuntimeStatusController {
  private status: SyncoreRuntimeStatus;
  private readonly listeners = new Set<() => void>();

  constructor(initialStatus: SyncoreRuntimeStatus) {
    this.status = initialStatus;
  }

  getStatus(): SyncoreRuntimeStatus {
    return this.status;
  }

  setStatus(nextStatus: SyncoreRuntimeStatus): void {
    this.status = nextStatus;
    for (const listener of this.listeners) {
      listener();
    }
  }

  watch(): SyncoreWatch<SyncoreRuntimeStatus> {
    return {
      onUpdate: (callback) => {
        this.listeners.add(callback);
        queueMicrotask(callback);
        return () => {
          this.listeners.delete(callback);
        };
      },
      localQueryResult: () => this.status,
      localQueryError: () => undefined
    };
  }
}
