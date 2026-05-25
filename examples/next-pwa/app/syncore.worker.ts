import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/_generated/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions
});
