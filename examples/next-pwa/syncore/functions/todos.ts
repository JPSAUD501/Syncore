import {
  mutation,
  query,
  v
} from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("todos").withIndex("by_complete").order("asc").collect()
});

export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("todos", { title: args.title, complete: false })
});

export const toggle = mutation({
  args: { id: v.string(), complete: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("todos", args.id, { complete: args.complete });
    return null;
  }
});
