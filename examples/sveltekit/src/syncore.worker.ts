/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { resolvedComponents } from "../syncore/_generated/components";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  components: resolvedComponents,
  databaseName: "syncore-habits",
  persistenceDatabaseName: "syncore-habits",
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker"
});
