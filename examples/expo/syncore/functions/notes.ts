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

export const stats = query({
  args: {},
  handler: async (ctx) => {
    const notes = await ctx.db
      .query("notes")
      .withIndex("by_pinned_created")
      .collect();
    const colors = new Map<string, number>();
    for (const note of notes) {
      colors.set(note.color, (colors.get(note.color) ?? 0) + 1);
    }

    return {
      total: notes.length,
      pinned: notes.filter((note) => note.pinned).length,
      colors: Array.from(colors.entries()).map(([color, count]) => ({
        color,
        count
      })),
      lastUpdatedAt:
        notes.length === 0
          ? null
          : Math.max(...notes.map((note) => note.updatedAt))
    };
  }
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

export const byColor = query({
  args: { color: s.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("notes")
      .withIndex("by_color", (q) => q.eq("color", args.color))
      .order("desc")
      .collect()
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

export const setColor = mutation({
  args: { id: s.string(), color: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("notes", args.id, {
      color: args.color,
      updatedAt: Date.now()
    });
    return null;
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

export const seedDemo = mutation({
  args: {},
  returns: s.number(),
  handler: async (ctx) => {
    const existing = await ctx.db.query("notes").collect();
    if (existing.length > 0) {
      return 0;
    }

    const samples = [
      {
        title: "Offline launch checklist",
        body: "Open the app with airplane mode enabled, create a note, pin it, then reopen to verify local persistence.",
        color: "#6C63FF",
        pinned: true
      },
      {
        title: "Dashboard trace ideas",
        body: "Watch notes/list, notes/stats, search, and pin mutations in the Syncore dashboard while editing this app.",
        color: "#4ECDC4",
        pinned: false
      },
      {
        title: "Expo web adapter",
        body: "The app code should stay clean. Platform-specific storage and wasm setup belong inside the Syncore Expo adapter.",
        color: "#FFEAA7",
        pinned: false
      }
    ];
    const now = Date.now();
    let inserted = 0;

    for (const [index, sample] of samples.entries()) {
      await ctx.db.insert("notes", {
        title: sample.title,
        body: sample.body,
        color: sample.color,
        pinned: sample.pinned,
        createdAt: now - index * 60_000,
        updatedAt: now - index * 60_000
      });
      inserted += 1;
    }

    return inserted;
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
