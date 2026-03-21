import type {
  ImpactScope,
  SyncoreExternalChangeApplier,
  SyncoreExternalChangeEvent,
  SyncoreExternalChangeSignal
} from "@syncore/core";
import type initSqlJs from "sql.js";
import type { SyncoreWebPersistence } from "./persistence.js";

type SqlJsDatabase = initSqlJs.Database;

export interface BroadcastChannelExternalChangeSignalOptions {
  channelName: string;
}

export class BroadcastChannelExternalChangeSignal implements SyncoreExternalChangeSignal {
  private readonly channel: BroadcastChannel | undefined;
  private readonly listeners = new Set<
    (event: SyncoreExternalChangeEvent) => void
  >();

  constructor(options: BroadcastChannelExternalChangeSignalOptions) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(options.channelName);
      this.channel.addEventListener("message", this.messageListener);
    }
  }

  subscribe(listener: (event: SyncoreExternalChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: SyncoreExternalChangeEvent): void {
    this.channel?.postMessage(event);
  }

  close(): void {
    this.channel?.removeEventListener("message", this.messageListener);
    this.channel?.close();
  }

  private readonly messageListener = (event: MessageEvent<unknown>) => {
    if (!isExternalChangeEvent(event.data)) {
      return;
    }
    for (const listener of this.listeners) {
      listener(event.data);
    }
  };
}

export interface SqlJsExternalChangeApplierOptions {
  databaseName: string;
  persistence: SyncoreWebPersistence;
  createDatabase: (bytes?: Uint8Array) => SqlJsDatabase;
  replaceDatabase(database: SqlJsDatabase): void;
}

export class SqlJsExternalChangeApplier implements SyncoreExternalChangeApplier {
  private readonly databaseName: string;
  private readonly persistence: SyncoreWebPersistence;
  private readonly createDatabase: (bytes?: Uint8Array) => SqlJsDatabase;
  private readonly replaceDatabase: (database: SqlJsDatabase) => void;

  constructor(options: SqlJsExternalChangeApplierOptions) {
    this.databaseName = options.databaseName;
    this.persistence = options.persistence;
    this.createDatabase = (bytes) => options.createDatabase(bytes);
    this.replaceDatabase = (database) => options.replaceDatabase(database);
  }

  async applyExternalChange(event: SyncoreExternalChangeEvent) {
    const databaseChanged = event.scope === "database" || event.scope === "all";
    if (databaseChanged) {
      const bytes = await this.persistence.loadDatabase(this.databaseName);
      if (bytes) {
        this.replaceDatabase(this.createDatabase(bytes));
      }
    }
    return {
      databaseChanged,
      storageChanged: event.scope === "storage" || event.scope === "all",
      changedScopes:
        event.changedScopes ??
        ([
          ...(event.changedTables ?? []).map((tableName) => `table:${tableName}`),
          ...(event.storageIds ?? []).map((storageId) => `storage:${storageId}`)
        ] as ImpactScope[])
    };
  }
}

export function createDefaultSyncChannelName(databaseName: string): string {
  return `syncore:external:${databaseName}`;
}

function isExternalChangeEvent(
  value: unknown
): value is SyncoreExternalChangeEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "sourceId" in value &&
    "scope" in value &&
    "reason" in value &&
    "timestamp" in value
  );
}
