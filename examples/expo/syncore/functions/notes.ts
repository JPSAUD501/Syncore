import {
  createFunctionReference,
  mutation,
  query,
  v
} from "../_generated/server";

const NOTE_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8"
];

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("notes").withIndex("by_pinned_created").order("desc").collect()
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, args) => ctx.db.get("notes", args.id)
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return ctx.db
      .query("notes")
      .withSearchIndex("search_body", (s) => s.search("body", args.query))
      .collect();
  }
});

export const create = mutation({
  args: { title: v.string(), body: v.string(), color: v.string() },
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
  args: { id: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, {
      title: args.title,
      body: args.body,
      updatedAt: Date.now()
    });
  }
});

export const togglePin = mutation({
  args: { id: v.string() },
  returns: v.null(),
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
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("notes", args.id);
    return null;
  }
});

export const scheduleAutoSave = mutation({
  args: { id: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, args) =>
    ctx.scheduler.runAfter(
      1500,
      createFunctionReference("mutation", "notes/update"),
      { id: args.id, title: args.title, body: args.body },
      { type: "skip" }
    )
});
