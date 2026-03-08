/// <reference lib="webworker" />

import { attachWebWorkerRuntime, createWebSyncoreRuntime } from "@syncore/platform-web";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void attachWebWorkerRuntime({
  endpoint: self,
  createRuntime: () =>
    createWebSyncoreRuntime({
      databaseName: "syncore-next-example",
      persistenceDatabaseName: "syncore-next-example",
      schema,
      functions,
      locateFile: () => "/sql-wasm.wasm",
      platform: "web-worker"
    })
});
