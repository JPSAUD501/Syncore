import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  databaseName: "syncore-bookmarks",
  persistenceDatabaseName: "syncore-bookmarks",
  schema,
  functions,
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker"
});
