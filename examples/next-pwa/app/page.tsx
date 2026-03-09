"use client";

import { SyncoreNextProvider } from "syncorejs/next";
import { BookmarksScreen } from "./bookmarks-screen";

const createWorker = () =>
  new Worker(new URL("./syncore.worker.js", import.meta.url), {
    type: "module"
  });

export default function Page() {
  return (
    <SyncoreNextProvider createWorker={createWorker}>
      <BookmarksScreen />
    </SyncoreNextProvider>
  );
}
