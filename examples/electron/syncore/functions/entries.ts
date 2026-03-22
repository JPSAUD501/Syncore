import { mutation, query, s } from "../_generated/server.js";

const MOODS = ["great", "good", "okay", "low", "rough"] as const;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** All entries, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("entries").withIndex("by_date").order("desc").collect()
});

/** Get entry for a specific date. */
export const getByDate = query({
  args: { date: s.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("entries")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first()
});

/** Full-text search across journal entries. */
export const search = query({
  args: { query: s.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return ctx.db
      .query("entries")
      .withSearchIndex("search_body", (s) => s.search("body", args.query))
      .collect();
  }
});

/** Create or update today's entry. */
export const upsert = mutation({
  args: { date: s.string(), body: s.string(), mood: s.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entries")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .first();

    const now = Date.now();
    const wc = countWords(args.body);

    if (existing) {
      await ctx.db.patch("entries", existing._id, {
        body: args.body,
        mood: args.mood,
        wordCount: wc,
        updatedAt: now
      });
      return existing._id;
    }

    return ctx.db.insert("entries", {
      date: args.date,
      body: args.body,
      mood: args.mood,
      wordCount: wc,
      createdAt: now,
      updatedAt: now
    });
  }
});

/** Delete an entry. */
export const remove = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete("entries", args.id);
    return null;
  }
});

export { MOODS, todayStr };
