import { createRendererSyncoreBridgeClient } from "@syncore/platform-node/ipc";
import { SyncoreProvider, useMutation, useQuery } from "@syncore/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../syncore/_generated/api";

declare global {
  interface Window {
    syncoreBridge: {
      postMessage(message: unknown): void;
      onMessage(listener: (message: unknown) => void): () => void;
    };
  }
}

export function App() {
  const client = useMemo(
    () => createRendererSyncoreBridgeClient(window.syncoreBridge),
    []
  );

  useEffect(() => () => client.dispose(), [client]);

  return (
    <SyncoreProvider client={client}>
      <TasksScreen />
    </SyncoreProvider>
  );
}

function TasksScreen() {
  const [draft, setDraft] = useState("");
  const tasks = useQuery(api.tasks.list) ?? [];
  const createTask = useMutation(api.tasks.create);
  const toggleDone = useMutation(api.tasks.toggleDone);

  const handleCreate = async () => {
    if (!draft.trim()) {
      return;
    }
    await createTask({ text: draft.trim() });
    setDraft("");
  };

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Electron + local runtime</p>
        <h1>Syncore stays on disk and reacts instantly in the renderer.</h1>
        <p className="body">
          The main process owns SQLite. The renderer only talks to typed functions through
          the Syncore IPC bridge.
        </p>
      </section>

      <section className="panel">
        <div className="composer">
          <input
            aria-label="Task draft"
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a local desktop task"
          />
          <button className="primaryButton" onClick={() => void handleCreate()} type="button">
            Add task
          </button>
        </div>

        <div className="metaRow">
          <span>Total tasks: {tasks.length}</span>
          <span>Completed: {tasks.filter((task) => task.done).length}</span>
        </div>

        <ul className="taskList" aria-label="Tasks">
          {tasks.map((task) => (
            <li key={task._id} className="taskCard">
              <div>
                <div className="taskTitle">{task.text}</div>
                <div className="taskStatus">
                  {task.done ? "Completed on this machine" : "Stored on this machine"}
                </div>
              </div>
              <button
                className="secondaryButton"
                onClick={() => void toggleDone({ id: task._id, done: !task.done })}
                type="button"
              >
                {task.done ? "Reopen" : "Complete"}
              </button>
            </li>
          ))}
          {tasks.length === 0 ? (
            <li className="emptyState">No local tasks yet.</li>
          ) : null}
        </ul>
      </section>
    </main>
  );
}
