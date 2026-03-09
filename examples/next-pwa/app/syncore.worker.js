/* eslint-disable */

import { createBrowserWorkerRuntime } from "syncore/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  databaseName: "syncore-next-example",
  persistenceDatabaseName: "syncore-next-example",
  schema,
  functions,
  locateFile: () => "/sql-wasm.wasm",
  platform: "browser-worker"
});
