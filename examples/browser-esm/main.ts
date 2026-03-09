import { createBrowserWorkerClient } from "syncore/browser";
import { createFunctionReference } from "syncore";

const output = document.querySelector("#output");

if (!output) {
  throw new Error("Missing #output element.");
}

const managed = createBrowserWorkerClient({
  workerUrl: new URL("./syncore.worker.ts", import.meta.url)
});

const listTasks = createFunctionReference<
  "query",
  Record<never, never>,
  Array<{ text: string }>
>("query", "tasks/list");
const createTask = createFunctionReference<
  "mutation",
  { text: string },
  string
>("mutation", "tasks/create");

const watch = managed.client.watchQuery(listTasks);
watch.onUpdate(() => {
  const tasks = watch.localQueryResult() ?? [];
  output.textContent =
    tasks.map((task) => task.text).join("\n") || "No tasks yet.";
});

void managed.client.mutation(createTask, { text: "Browser ESM task" });

window.addEventListener("beforeunload", () => {
  watch.dispose?.();
  managed.dispose();
});
