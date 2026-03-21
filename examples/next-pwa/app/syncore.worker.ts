import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  databaseName: "syncore-planner",
  persistenceDatabaseName: "syncore-planner",
  storageNamespace: "syncore-planner-artifacts",
  // IndexedDB is more stable than OPFS during Next dev/HMR churn.
  persistenceMode: "indexeddb",
  schema,
  functions,
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker",
  scheduler: {
    pollIntervalMs: 1_000
  }
});
