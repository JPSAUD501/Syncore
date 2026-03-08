import {
  mutation,
  query,
  v
} from "../_generated/server.js";

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tasks").order("desc").collect()
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { text: args.text, done: false })
});

export const toggleDone = mutation({
  args: { id: v.id("tasks"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("tasks", args.id, { done: args.done });
    return null;
  }
});
