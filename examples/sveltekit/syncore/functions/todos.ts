import { mutation, query, v } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("todos").withIndex("by_done").order("asc").collect()
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("todos", { text: args.text, done: false })
});
