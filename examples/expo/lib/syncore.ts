import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import schema from "../syncore/_generated/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions
});
