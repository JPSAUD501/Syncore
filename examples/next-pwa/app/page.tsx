"use client";

import { SyncoreNextProvider } from "syncorejs/next";
import { PlannerScreen } from "./planner-screen";

export default function Page() {
  return (
    <SyncoreNextProvider
      createWorker={() =>
        new Worker(new URL("./syncore.worker.ts", import.meta.url), {
          type: "module",
          name: "syncore-planner"
        })
      }
    >
      <PlannerScreen />
    </SyncoreNextProvider>
  );
}
