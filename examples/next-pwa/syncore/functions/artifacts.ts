import {
  action,
  mutation,
  query,
  s
} from "../_generated/server";
import { api } from "../_generated/api";
import { formatPlannerDate } from "../planner";

function fileNameFor(kind: string, title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "artifact"}-${kind === "task_snapshot" ? "snapshot.json" : "brief.md"}`;
}

function titleFor(kind: string, baseTitle: string) {
  return kind === "task_snapshot"
    ? `${baseTitle} snapshot`
    : `${baseTitle} daily brief`;
}

export const listByTask = query({
  args: { taskId: s.id("tasks") },
  handler: async (ctx, args) => {
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_task_created", (range) => range.eq("taskId", args.taskId))
      .order("desc")
      .collect();

    return artifacts;
  }
});

export const getContent = query({
  args: { id: s.id("artifacts") },
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.id);
    if (!artifact) {
      return null;
    }

    const bytes = await ctx.storage.read(artifact.storageId);
    if (!bytes) {
      return null;
    }

    return {
      ...artifact,
      content: new TextDecoder().decode(bytes)
    };
  }
});

export const createRecord = mutation({
  args: {
    taskId: s.id("tasks"),
    kind: s.string(),
    title: s.string(),
    storageId: s.string(),
    contentType: s.string(),
    size: s.number()
  },
  returns: s.string(),
  handler: async (ctx, args) =>
    ctx.db.insert("artifacts", {
      taskId: args.taskId,
      kind: args.kind,
      title: args.title,
      storageId: args.storageId,
      contentType: args.contentType,
      size: args.size,
      createdAt: Date.now()
    })
});

export const remove = mutation({
  args: { id: s.id("artifacts") },
  returns: s.null(),
  handler: async (ctx, args) => {
    const artifact = await ctx.db.get("artifacts", args.id);
    if (!artifact) {
      return null;
    }

    await ctx.storage.delete(artifact.storageId).catch(() => undefined);
    await ctx.db.delete("artifacts", args.id);
    return null;
  }
});

export const generate = action({
  args: {
    taskId: s.id("tasks"),
    kind: s.string()
  },
  returns: s.object({
    artifactId: s.string(),
    title: s.string(),
    contentType: s.string(),
    preview: s.string()
  }),
  handler: async (ctx, args) => {
    const task = await ctx.runQuery(api.tasks.get, { id: args.taskId });
    if (!task) {
      throw new Error("Task not found.");
    }

    const title = titleFor(args.kind, task.title);
    const workspace = await ctx.runQuery(api.tasks.workspace, {
      projectId: task.projectId ?? undefined
    });
    const createdAt = Date.now();
    const content =
      args.kind === "task_snapshot"
        ? JSON.stringify(
            {
              generatedAt: createdAt,
              task,
              workspaceTotals: workspace.totals
            },
            null,
            2
          )
        : [
            `# ${title}`,
            "",
            `Generated locally on ${formatPlannerDate(createdAt)}.`,
            "",
            `## Focus task`,
            `- Title: ${task.title}`,
            `- Status: ${task.status}`,
            `- Priority: ${task.priority}`,
            `- Project: ${task.projectName ?? "Unassigned"}`,
            `- Due: ${task.dueAt ? formatPlannerDate(task.dueAt) : "Not scheduled"}`,
            "",
            `## Notes`,
            task.details || "No additional notes.",
            "",
            `## Workspace pulse`,
            `- Inbox: ${workspace.totals.inbox}`,
            `- Today: ${workspace.totals.today}`,
            `- Upcoming: ${workspace.totals.upcoming}`,
            `- Done: ${workspace.totals.done}`
          ].join("\n");

    const contentType =
      args.kind === "task_snapshot"
        ? "application/json"
        : "text/markdown";

    const storageId = await ctx.storage.put({
      fileName: fileNameFor(args.kind, task.title),
      contentType,
      data: content
    });
    const metadata = await ctx.storage.get(storageId);

    const artifactId = await ctx.runMutation(api.artifacts.createRecord, {
      taskId: args.taskId,
      kind: args.kind,
      title,
      storageId,
      contentType,
      size: metadata?.size ?? content.length
    });

    return {
      artifactId,
      title,
      contentType,
      preview: content
    };
  }
});
