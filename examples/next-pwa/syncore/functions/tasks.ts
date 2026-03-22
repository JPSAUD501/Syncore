import {
  createFunctionReference,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
  s
} from "../_generated/server";
import { buildTaskSearchText, DEMO_PROJECTS } from "../planner";

const TRIGGER_REMINDER = createFunctionReference(
  "mutation",
  "tasks/triggerReminder"
);

type TaskStatus = "inbox" | "today" | "upcoming" | "done";
type TaskPriority = "low" | "medium" | "high";

interface TaskSummary {
  _id: string;
  title: string;
  details: string;
  status: string;
  priority: string;
  projectId?: string;
  projectName?: string;
  projectColor?: string;
  dueAt?: number;
  reminderAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface TaskRecordShape {
  _id: string;
  title: string;
  details: string;
  status: string;
  priority: string;
  projectId?: string;
  dueAt?: number;
  reminderAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

function optionalProp<TKey extends string, TValue>(
  key: TKey,
  value: TValue | undefined
): { [K in TKey]?: TValue } {
  if (value === undefined) {
    return {};
  }
  return { [key]: value } as { [K in TKey]: TValue };
}

interface WorkspacePayload {
  sections: {
    inbox: TaskSummary[];
    today: TaskSummary[];
    upcoming: TaskSummary[];
    done: TaskSummary[];
  };
  totals: {
    inbox: number;
    today: number;
    upcoming: number;
    done: number;
    all: number;
  };
}

function normalizeStatus(status: string): TaskStatus {
  switch (status) {
    case "today":
    case "upcoming":
    case "done":
      return status;
    default:
      return "inbox";
  }
}

function normalizePriority(priority: string): TaskPriority {
  switch (priority) {
    case "low":
    case "high":
      return priority;
    default:
      return "medium";
  }
}

function sortOpenTasks<
  TTask extends {
    dueAt?: number;
    reminderAt?: number;
    updatedAt: number;
    createdAt: number;
  }
>(tasks: TTask[]): TTask[] {
  return [...tasks].sort((left, right) => {
    const leftKey = left.reminderAt ?? left.dueAt ?? Number.MAX_SAFE_INTEGER;
    const rightKey = right.reminderAt ?? right.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (leftKey !== rightKey) {
      return leftKey - rightKey;
    }
    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right.createdAt - left.createdAt;
  });
}

async function projectMapForTasks(
  ctx: QueryCtx,
  tasks: Array<{ projectId?: string }>
) {
  const projectIds = [
    ...new Set(
      tasks
        .map((task) => task.projectId)
        .filter((projectId): projectId is string => typeof projectId === "string")
    )
  ];
  const projects = await Promise.all(
    projectIds.map((projectId) => ctx.db.get("projects", projectId))
  );
  return new Map(
    projects
      .filter((project): project is NonNullable<typeof project> => project !== null)
      .map((project) => [project._id, project])
  );
}

function decorateTask(
  task: TaskRecordShape,
  projects: Map<string, { name: string; color: string }>
): TaskSummary {
  const project = task.projectId ? projects.get(task.projectId) : undefined;
  return {
    _id: task._id,
    title: task.title,
    details: task.details,
    status: task.status,
    priority: task.priority,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    ...optionalProp("projectId", task.projectId),
    ...optionalProp("projectName", project?.name),
    ...optionalProp("projectColor", project?.color),
    ...optionalProp("dueAt", task.dueAt),
    ...optionalProp("reminderAt", task.reminderAt),
    ...optionalProp("completedAt", task.completedAt)
  };
}

async function replaceReminderSchedule(
  ctx: MutationCtx,
  task: {
    _id: string;
    reminderAt?: number;
    reminderJobId?: string;
  },
  reminderAt?: number
) {
  if (task.reminderJobId) {
    await ctx.scheduler.cancel(task.reminderJobId).catch(() => undefined);
  }

  if (reminderAt === undefined || reminderAt <= Date.now()) {
    return undefined;
  }

  return ctx.scheduler.runAt(
    reminderAt,
    TRIGGER_REMINDER,
    {
      id: task._id,
      scheduledFor: reminderAt
    },
    { type: "run_once_if_missed" }
  );
}

async function buildSearchText(
  ctx: MutationCtx,
  input: {
    title: string;
    details: string;
    priority: string;
    status: string;
    projectId: string | undefined;
  }
) {
  const project = input.projectId
    ? await ctx.db.get("projects", input.projectId)
    : null;
  return buildTaskSearchText({
    title: input.title,
    details: input.details,
    priority: input.priority,
    status: input.status,
    projectName: project?.name
  });
}

export const workspace = query({
  args: {
    projectId: s.optional(s.id("projects"))
  },
  handler: async (ctx, args): Promise<WorkspacePayload> => {
    const statuses = ["inbox", "today", "upcoming", "done"] as const;
    const sections = {
      inbox: [] as TaskSummary[],
      today: [] as TaskSummary[],
      upcoming: [] as TaskSummary[],
      done: [] as TaskSummary[]
    };

    for (const status of statuses) {
      const records = await ctx.db
        .query("tasks")
        .withIndex("by_status_updated", (range) => range.eq("status", status))
        .order("desc")
        .collect();
      const filtered =
        args.projectId === undefined
          ? records
          : records.filter((record) => record.projectId === args.projectId);
      const projectMap = await projectMapForTasks(ctx, filtered);
      const mapped = filtered.map((record) => decorateTask(record, projectMap));
      sections[status] =
        status === "done"
          ? mapped.sort(
              (left, right) =>
                (right.completedAt ?? right.updatedAt) -
                (left.completedAt ?? left.updatedAt)
            )
          : sortOpenTasks(mapped);
    }

    return {
      sections,
      totals: {
        inbox: sections.inbox.length,
        today: sections.today.length,
        upcoming: sections.upcoming.length,
        done: sections.done.length,
        all:
          sections.inbox.length +
          sections.today.length +
          sections.upcoming.length +
          sections.done.length
      }
    };
  }
});

export const get = query({
  args: { id: s.id("tasks") },
  handler: async (ctx, args): Promise<TaskSummary | null> => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    const projectMap = await projectMapForTasks(ctx, [task]);
    return decorateTask(task, projectMap);
  }
});

export const search = query({
  args: {
    query: s.string(),
    projectId: s.optional(s.id("projects"))
  },
  handler: async (ctx, args): Promise<TaskSummary[]> => {
    const trimmed = args.query.trim();
    if (!trimmed) {
      return [];
    }

    const records = await ctx.db
      .query("tasks")
      .withSearchIndex("search_tasks", (searchIndex) => {
        let next = searchIndex.search("searchText", trimmed.toLowerCase());
        if (args.projectId) {
          next = next.eq("projectId", args.projectId);
        }
        return next;
      })
      .collect();

    const projectMap = await projectMapForTasks(ctx, records);
    return sortOpenTasks(
      records.map((record) => decorateTask(record, projectMap))
    );
  }
});

export const create = mutation({
  args: {
    title: s.string(),
    details: s.optional(s.string()),
    status: s.optional(s.string()),
    priority: s.optional(s.string()),
    projectId: s.optional(s.id("projects")),
    dueAt: s.optional(s.number()),
    reminderAt: s.optional(s.number())
  },
  returns: s.string(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const status = normalizeStatus(args.status ?? "inbox");
    const priority = normalizePriority(args.priority ?? "medium");
    const searchText = await buildSearchText(ctx, {
      title: args.title.trim(),
      details: args.details?.trim() ?? "",
      priority,
      status,
      projectId: args.projectId ?? undefined
    });

    const id = await ctx.db.insert("tasks", {
      title: args.title.trim(),
      details: args.details?.trim() ?? "",
      status,
      priority,
      createdAt: now,
      updatedAt: now,
      searchText,
      ...optionalProp("projectId", args.projectId),
      ...optionalProp("dueAt", args.dueAt),
      ...optionalProp("reminderAt", args.reminderAt)
    });

    const reminderJobId = await replaceReminderSchedule(
      ctx,
      { _id: id },
      args.reminderAt
    );

    if (reminderJobId) {
      await ctx.db.patch("tasks", id, { reminderJobId });
    }

    return id;
  }
});

export const update = mutation({
  args: {
    id: s.id("tasks"),
    title: s.string(),
    details: s.string(),
    priority: s.string(),
    projectId: s.optional(s.id("projects")),
    dueAt: s.optional(s.number())
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    const priority = normalizePriority(args.priority);
    const searchText = await buildSearchText(ctx, {
      title: args.title.trim(),
      details: args.details.trim(),
      priority,
      status: task.status,
      projectId: args.projectId ?? undefined
    });

    await ctx.db.patch("tasks", args.id, {
      title: args.title.trim(),
      details: args.details.trim(),
      priority,
      projectId: args.projectId ?? undefined,
      dueAt: args.dueAt ?? undefined,
      updatedAt: Date.now(),
      searchText
    });
    return null;
  }
});

export const move = mutation({
  args: {
    id: s.id("tasks"),
    status: s.string()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    const status = normalizeStatus(args.status);
    const searchText = await buildSearchText(ctx, {
      title: task.title,
      details: task.details,
      priority: task.priority,
      status,
      projectId: task.projectId
    });

    await ctx.db.patch("tasks", args.id, {
      status,
      completedAt: status === "done" ? Date.now() : undefined,
      updatedAt: Date.now(),
      searchText
    });
    return null;
  }
});

export const complete = mutation({
  args: { id: s.id("tasks") },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    const reminderJobId = await replaceReminderSchedule(ctx, task, undefined);
    const searchText = await buildSearchText(ctx, {
      title: task.title,
      details: task.details,
      priority: task.priority,
      status: "done",
      projectId: task.projectId
    });

    await ctx.db.patch("tasks", args.id, {
      status: "done",
      completedAt: Date.now(),
      reminderAt: undefined,
      reminderJobId: reminderJobId ?? undefined,
      updatedAt: Date.now(),
      searchText
    });
    return null;
  }
});

export const reopen = mutation({
  args: {
    id: s.id("tasks"),
    status: s.optional(s.string())
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    const status = normalizeStatus(args.status ?? "today");
    const searchText = await buildSearchText(ctx, {
      title: task.title,
      details: task.details,
      priority: task.priority,
      status,
      projectId: task.projectId
    });

    await ctx.db.patch("tasks", args.id, {
      status,
      completedAt: undefined,
      updatedAt: Date.now(),
      searchText
    });
    return null;
  }
});

export const scheduleReminder = mutation({
  args: {
    id: s.id("tasks"),
    reminderAt: s.optional(s.number())
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    const nextJobId = await replaceReminderSchedule(
      ctx,
      task,
      args.reminderAt ?? undefined
    );
    await ctx.db.patch("tasks", args.id, {
      reminderAt: args.reminderAt ?? undefined,
      reminderJobId: nextJobId ?? undefined,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const triggerReminder = mutation({
  args: {
    id: s.id("tasks"),
    scheduledFor: s.number()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    if (
      task.status === "done" ||
      task.reminderAt === undefined ||
      task.reminderAt !== args.scheduledFor
    ) {
      return null;
    }

    const searchText = await buildSearchText(ctx, {
      title: task.title,
      details: task.details,
      priority: task.priority,
      status: "today",
      projectId: task.projectId
    });

    await ctx.db.patch("tasks", args.id, {
      status: "today",
      reminderJobId: undefined,
      updatedAt: Date.now(),
      searchText
    });
    return null;
  }
});

export const remove = mutation({
  args: { id: s.id("tasks") },
  returns: s.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get("tasks", args.id);
    if (!task) {
      return null;
    }

    if (task.reminderJobId) {
      await ctx.scheduler.cancel(task.reminderJobId).catch(() => undefined);
    }

    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_task_created", (range) => range.eq("taskId", args.id))
      .collect();

    for (const artifact of artifacts) {
      await ctx.storage.delete(artifact.storageId).catch(() => undefined);
      await ctx.db.delete("artifacts", artifact._id);
    }

    await ctx.db.delete("tasks", args.id);
    return null;
  }
});

export const seedDemo = mutation({
  args: {},
  returns: s.null(),
  handler: async (ctx) => {
    const existingTasks = await ctx.db.query("tasks").collect();
    if (existingTasks.length > 0) {
      return null;
    }

    const now = Date.now();
    const projectIds: string[] = [];

    for (const [index, project] of DEMO_PROJECTS.entries()) {
      const id = await ctx.db.insert("projects", {
        name: project.name,
        slug: project.name.toLowerCase().replace(/\s+/g, "-"),
        color: project.color,
        sortOrder: index,
        createdAt: now - index * 1_000
      });
      projectIds.push(id);
    }

    const seededTasks: Array<{
      title: string;
      details: string;
      status: TaskStatus;
      priority: TaskPriority;
      projectId: string | undefined;
      dueAt: number | undefined;
      reminderAt: number | undefined;
    }> = [
      {
        title: "Trim the install flow copy",
        details: "Make onboarding read like a product, not a scaffold.",
        status: "today",
        priority: "high",
        projectId: projectIds[0],
        dueAt: undefined,
        reminderAt: undefined
      },
      {
        title: "Review storage API notes",
        details: "Collect examples for text artifacts and note snapshots.",
        status: "inbox",
        priority: "medium",
        projectId: projectIds[1],
        dueAt: undefined,
        reminderAt: undefined
      },
      {
        title: "Prepare demo script",
        details: "Sequence offline, search, reminder, and artifact generation.",
        status: "upcoming",
        priority: "high",
        projectId: projectIds[0],
        dueAt: undefined,
        reminderAt: now + 15 * 60 * 1000
      },
      {
        title: "Renew domain invoice",
        details: "Personal admin item with a soft reminder tomorrow morning.",
        status: "upcoming",
        priority: "low",
        projectId: projectIds[2],
        dueAt: now + 24 * 60 * 60 * 1000,
        reminderAt: undefined
      },
      {
        title: "Archive old experiment notes",
        details: "Finished cleanup pass from last week.",
        status: "done",
        priority: "low",
        projectId: projectIds[1],
        dueAt: undefined,
        reminderAt: undefined
      }
    ];

    for (const [index, seededTask] of seededTasks.entries()) {
      const createdAt = now - (index + 1) * 45 * 60 * 1000;
      const searchText = await buildSearchText(ctx, {
        title: seededTask.title,
        details: seededTask.details,
        priority: seededTask.priority,
        status: seededTask.status,
        projectId: seededTask.projectId
      });
      const id = await ctx.db.insert("tasks", {
        title: seededTask.title,
        details: seededTask.details,
        status: seededTask.status,
        priority: seededTask.priority,
        createdAt,
        updatedAt: createdAt,
        searchText,
        ...optionalProp("projectId", seededTask.projectId),
        ...optionalProp("dueAt", seededTask.dueAt),
        ...optionalProp("reminderAt", seededTask.reminderAt),
        ...optionalProp(
          "completedAt",
          seededTask.status === "done" ? createdAt : undefined
        )
      });
      const reminderJobId = await replaceReminderSchedule(
        ctx,
        { _id: id },
        seededTask.reminderAt
      );
      if (reminderJobId) {
        await ctx.db.patch("tasks", id, { reminderJobId });
      }
    }

    return null;
  }
});
