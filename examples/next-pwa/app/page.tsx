"use client";

import { SyncoreNextProvider } from "@syncore/next";
import { TodosScreen } from "./todos-screen";

export default function Page() {
  return (
    <SyncoreNextProvider
      workerUrl={new URL("./syncore.worker.ts", import.meta.url)}
    >
      <TodosScreen />
    </SyncoreNextProvider>
  );
}
