import { mutation, query, s } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("asc").collect()
});

export const create = mutation({
  args: { text: s.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { text: args.text, done: false })
});
