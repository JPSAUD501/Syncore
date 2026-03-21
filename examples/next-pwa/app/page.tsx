"use client";

import { SyncoreNextProvider } from "syncorejs/next";
import { PlannerScreen } from "./planner-screen";

function createPlannerWorker() {
  return new Worker(new URL("./syncore.worker.ts", import.meta.url), {
    type: "module",
    name: "syncore-planner"
  });
}

export default function Page() {
  return (
    <SyncoreNextProvider createWorker={createPlannerWorker}>
      <PlannerScreen />
    </SyncoreNextProvider>
  );
}
