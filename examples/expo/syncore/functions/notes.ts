import {
  createFunctionReference,
  mutation,
  query,
  v
} from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("notes").withIndex("by_pinned").order("asc").collect()
});

export const create = mutation({
  args: { body: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("notes", { body: args.body, pinned: false })
});

export const togglePinned = mutation({
  args: { id: v.string(), pinned: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, { pinned: args.pinned });
    return null;
  }
});

export const resetAll = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const notes = await ctx.db.query("notes").collect();
    for (const note of notes) {
      await ctx.db.delete("notes", note._id);
    }
    return null;
  }
});

export const createFromScheduler = mutation({
  args: { body: v.string(), pinned: v.boolean() },
  handler: async (ctx, args) =>
    ctx.db.insert("notes", { body: args.body, pinned: args.pinned })
});

export const scheduleCreateCatchUp = mutation({
  args: { body: v.string(), delayMs: v.number() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      args.delayMs,
      createFunctionReference("mutation", "notes/createFromScheduler"),
      { body: args.body, pinned: false },
      { type: "catch_up" }
    )
});

export const scheduleCreateSkip = mutation({
  args: { body: v.string(), delayMs: v.number() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      args.delayMs,
      createFunctionReference("mutation", "notes/createFromScheduler"),
      { body: args.body, pinned: false },
      { type: "skip" }
    )
});
