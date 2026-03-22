import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import schema from "../syncore/_generated/schema";
import { resolvedComponents } from "../syncore/_generated/components";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  databaseName: "syncore-expo-notes.db",
  storageDirectoryName: "syncore-expo-notes-storage",
  schema,
  functions,
  components: resolvedComponents,
  scheduler: { pollIntervalMs: 500 }
});
