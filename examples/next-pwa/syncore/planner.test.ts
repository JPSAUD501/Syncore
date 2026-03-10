import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeSyncoreRuntime } from "syncorejs/node";
import { api } from "./_generated/api";
import { functions } from "./_generated/functions";
import schema from "./schema";

const runtimeRoots: string[] = [];

afterEach(async () => {
  for (const root of runtimeRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function withRuntime(
  callback: (
    client: ReturnType<
      ReturnType<typeof createNodeSyncoreRuntime>["createClient"]
    >
  ) => Promise<void>
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "syncore-next-pwa-"));
  runtimeRoots.push(root);

  const runtime = createNodeSyncoreRuntime({
    schema,
    functions,
    databasePath: path.join(root, "planner.db"),
    storageDirectory: path.join(root, "storage"),
    scheduler: {
      pollIntervalMs: 10
    },
    devtools: false
  });

  await runtime.start();
  try {
    await callback(runtime.createClient());
  } finally {
    await runtime.stop();
  }
}

describe("next-pwa planner functions", () => {
  it("creates, updates, moves, and searches tasks", async () => {
    await withRuntime(async (client) => {
      const projectId = await client.mutation(api.projects.create, {
        name: "Release prep",
        color: undefined
      });

      const taskId = await client.mutation(api.tasks.create, {
        title: "Write launch notes",
        details: "Keep the release announcement crisp.",
        status: "inbox",
        priority: "medium",
        projectId,
        dueAt: undefined,
        reminderAt: undefined
      });

      await client.mutation(api.tasks.update, {
        id: taskId,
        title: "Write sharper launch notes",
        details: "Keep the release announcement crisp and practical.",
        priority: "high",
        projectId,
        dueAt: undefined
      });
      await client.mutation(api.tasks.move, {
        id: taskId,
        status: "today"
      });

      const task = await client.query(api.tasks.get, { id: taskId });
      const search = await client.query(api.tasks.search, {
        query: "sharper launch",
        projectId: undefined
      });
      const workspace = await client.query(api.tasks.workspace, {
        projectId: undefined
      });

      expect(task?.status).toBe("today");
      expect(task?.projectName).toBe("Release prep");
      expect(search.map((entry) => entry._id)).toContain(taskId);
      expect(workspace.totals.today).toBe(1);
    });
  });

  it("moves tasks into Today when a reminder fires", async () => {
    await withRuntime(async (client) => {
      const taskId = await client.mutation(api.tasks.create, {
        title: "Ping design review",
        status: "upcoming",
        details: undefined,
        priority: undefined,
        projectId: undefined,
        dueAt: undefined,
        reminderAt: Date.now() + 40
      });

      await new Promise((resolve) => setTimeout(resolve, 180));

      const task = await client.query(api.tasks.get, { id: taskId });
      expect(task?.status).toBe("today");
    });
  });

  it("generates planner artifacts in storage and returns readable content", async () => {
    await withRuntime(async (client) => {
      const taskId = await client.mutation(api.tasks.create, {
        title: "Document storage demo",
        details: "Need a task snapshot for the example.",
        status: undefined,
        priority: undefined,
        projectId: undefined,
        dueAt: undefined,
        reminderAt: undefined
      });

      const generated = await client.action(api.artifacts.generate, {
        taskId,
        kind: "task_snapshot"
      });
      const artifacts = await client.query(api.artifacts.listByTask, { taskId });
      const preview = await client.query(api.artifacts.getContent, {
        id: generated.artifactId
      });

      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]?.storageId).toBeTruthy();
      expect(preview?.content).toContain("Document storage demo");
      expect(preview?.contentType).toBe("application/json");
    });
  });
});
