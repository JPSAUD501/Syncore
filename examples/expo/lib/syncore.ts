import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

export const syncore = createExpoSyncoreBootstrap({
  databaseName: "syncore-expo-notes.db",
  storageDirectoryName: "syncore-expo-notes-storage",
  schema,
  functions,
  scheduler: { pollIntervalMs: 500 }
});
