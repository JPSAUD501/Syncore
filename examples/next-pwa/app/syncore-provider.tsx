"use client";

import { SyncoreNextProvider } from "@syncore/next";
import { useCallback, type ReactNode } from "react";

export function SyncoreExampleProvider({
  children
}: {
  children: ReactNode;
}) {
  const createWorker = useCallback(
    () =>
      new Worker(new URL("./syncore.worker.ts", import.meta.url), {
        type: "module"
      }),
    []
  );

  return (
    <SyncoreNextProvider createWorker={createWorker} serviceWorkerUrl="/sw.js">
      {children}
    </SyncoreNextProvider>
  );
}
