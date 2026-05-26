import type {
  ImpactScope,
  SyncoreExternalChangeApplier,
  SyncoreExternalChangeEvent,
  SyncoreExternalChangeSignal
} from "@syncore/core";
import type initSqlJs from "sql.js";
import type { SyncoreWebPersistence } from "./persistence.js";

type SqlJsDatabase = initSqlJs.Database;

/** Options for constructing a {@link BroadcastChannelExternalChangeSignal}. */
export interface BroadcastChannelExternalChangeSignalOptions {
  /** Name of the `BroadcastChannel`, shared by all tabs with the same database. */
  channelName: string;
}

/**
 * A `BroadcastChannel`-based SyncoreExternalChangeSignal that
 * propagates database-mutation events across all browser tabs sharing the same
 * Syncore database.
 *
 * When a Syncore mutation commits, the runtime publishes a change event on this
 * channel. Other tabs subscribed to the same channel reload their queries
 * automatically, keeping all open tabs in sync without a server round-trip.
 *
 * Constructed automatically by `createWebSyncoreRuntime`. Exposed for
 * advanced setups that build the persistence layer independently.
 */
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

/** Options for constructing a {@link SqlJsExternalChangeApplier}. */
export interface SqlJsExternalChangeApplierOptions {
  /** Logical name of the Syncore database, used to load the latest snapshot from persistence. */
  databaseName: string;
  /** The web persistence layer to read the updated database bytes from. */
  persistence: SyncoreWebPersistence;
  /**
   * Factory that creates a new sql.js `Database` instance from optional
   * initial bytes. Called whenever the database needs to be swapped after an
   * external change.
   */
  createDatabase: (bytes?: Uint8Array) => SqlJsDatabase;
  /** Callback invoked with the newly created database so the runtime can swap its reference. */
  replaceDatabase(database: SqlJsDatabase): void;
}

/**
 * A SyncoreExternalChangeApplier for sql.js (in-memory) databases.
 *
 * When another tab commits a mutation and broadcasts the change event, this
 * applier loads the latest database snapshot from web persistence (OPFS or
 * IndexedDB) and swaps the in-memory `sql.js` database instance so the current
 * tab reflects the new state.
 *
 * Constructed automatically by `createWebSyncoreRuntime` when using sql.js
 * persistence. Exposed for advanced setups.
 */
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

/**
 * Derive the canonical `BroadcastChannel` name for cross-tab sync from a
 * logical database name.
 *
 * All Syncore runtimes sharing the same `databaseName` will use the same
 * channel, ensuring mutations in one tab are visible to all others.
 */
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
