"use client";

import { SyncoreExampleProvider } from "./syncore-provider";
import { TodosScreen } from "./todos-screen";

export default function Page() {
  return (
    <SyncoreExampleProvider>
      <TodosScreen />
    </SyncoreExampleProvider>
  );
}
