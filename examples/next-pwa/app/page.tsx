"use client";

import { SyncoreNextProvider } from "syncore/next";
import { TodosScreen } from "./todos-screen";

const createWorker = () =>
  new Worker(new URL("./syncore.worker.js", import.meta.url), {
    type: "module"
  });

export default function Page() {
  return (
    <SyncoreNextProvider createWorker={createWorker}>
      <TodosScreen />
    </SyncoreNextProvider>
  );
}
