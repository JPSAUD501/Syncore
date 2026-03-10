import { mutation, query, v } from "../_generated/server";
import { PROJECT_COLORS, slugifyProjectName } from "../planner";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_sort")
      .collect();

    return projects
      .filter((project) => project.archivedAt === undefined)
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }
});

export const create = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string())
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("projects").withIndex("by_sort").collect();
    const now = Date.now();

    return ctx.db.insert("projects", {
      name: args.name.trim(),
      slug: slugifyProjectName(args.name),
      color:
        args.color && args.color.trim().length > 0
          ? args.color
          : PROJECT_COLORS[existing.length % PROJECT_COLORS.length]!,
      sortOrder: existing.length,
      createdAt: now,
      archivedAt: undefined
    });
  }
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.string(),
    color: v.string()
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.id, {
      name: args.name.trim(),
      slug: slugifyProjectName(args.name),
      color: args.color
    });
    return null;
  }
});

export const archive = mutation({
  args: { id: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("projects", args.id, {
      archivedAt: Date.now()
    });
    return null;
  }
});
