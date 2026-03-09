import { createExpoSyncoreBootstrap } from "syncore/expo";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

const bootstrap = createExpoSyncoreBootstrap({
  databaseName: "syncore-expo-example.db",
  storageDirectoryName: "syncore-expo-example-storage",
  schema,
  functions,
  scheduler: {
    pollIntervalMs: 25
  }
});

export const syncore = bootstrap;

export function createExampleRuntime() {
  return bootstrap.getRuntime();
}

export function startSyncore() {
  return bootstrap.getClient();
}

export async function resetSyncore(): Promise<void> {
  await bootstrap.reset();
}
