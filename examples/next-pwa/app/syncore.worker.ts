import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  databaseName: "syncore-planner",
  persistenceDatabaseName: "syncore-planner",
  storageNamespace: "syncore-planner-artifacts",
  persistenceMode: "auto",
  schema,
  functions,
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker",
  scheduler: {
    pollIntervalMs: 1_000
  }
});
