import {
  createFunctionReference,
  mutation,
  query,
  s
} from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("notes").withIndex("by_pinned_created").order("desc").collect()
});

export const get = query({
  args: { id: s.string() },
  handler: async (ctx, args) => ctx.db.get("notes", args.id)
});

export const search = query({
  args: { query: s.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return ctx.db
      .query("notes")
      .withSearchIndex("search_body", (s) => s.search("body", args.query))
      .collect();
  }
});

export const create = mutation({
  args: { title: s.string(), body: s.string(), color: s.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("notes", {
      title: args.title,
      body: args.body,
      color: args.color,
      pinned: false,
      createdAt: now,
      updatedAt: now
    });
  }
});

export const update = mutation({
  args: { id: s.string(), title: s.string(), body: s.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, {
      title: args.title,
      body: args.body,
      updatedAt: Date.now()
    });
  }
});

export const togglePin = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get("notes", args.id);
    if (!note) return null;
    await ctx.db.patch("notes", args.id, {
      pinned: !note.pinned,
      updatedAt: Date.now()
    });
    return null;
  }
});

export const remove = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("notes", args.id);
    return null;
  }
});

export const scheduleAutoSave = mutation({
  args: { id: s.string(), title: s.string(), body: s.string() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      1500,
      createFunctionReference("mutation", "notes/update"),
      { id: args.id, title: args.title, body: args.body },
      { type: "skip" }
    )
});
