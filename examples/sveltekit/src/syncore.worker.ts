/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncore/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "syncore-habits",
  persistenceDatabaseName: "syncore-habits",
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker"
});
