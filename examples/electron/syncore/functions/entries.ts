import { mutation, query, s } from "../_generated/server.js";

const MOODS = ["great", "good", "okay", "low", "rough"] as const;
type Mood = (typeof MOODS)[number];

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

/** Aggregate local journal stats for the sidebar. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_date")
      .order("desc")
      .collect();
    const moodCounts = Object.fromEntries(MOODS.map((mood) => [mood, 0]));
    for (const entry of entries) {
      if (entry.mood in moodCounts) {
        moodCounts[entry.mood] = (moodCounts[entry.mood] ?? 0) + 1;
      }
    }

    const entryDates = new Set(entries.map((entry) => entry.date));
    let streak = 0;
    const cursor = new Date();
    while (true) {
      const date = cursor.toISOString().slice(0, 10);
      if (entryDates.has(date)) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else if (date === todayStr()) {
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      entryCount: entries.length,
      totalWords: entries.reduce(
        (sum, entry) => sum + countWords(entry.body),
        0
      ),
      streak,
      moodCounts,
      lastUpdatedAt: entries[0]?.updatedAt ?? null
    };
  }
});

/** Entries with a specific mood, newest first. */
export const byMood = query({
  args: { mood: s.string() },
  handler: async (ctx, args) => {
    if (!MOODS.includes(args.mood as Mood)) {
      return [];
    }
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_date")
      .order("desc")
      .collect();
    return entries.filter((entry) => entry.mood === args.mood);
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

/** Add a small sample week for dashboard exploration. */
export const seedDemo = mutation({
  args: {},
  returns: s.number(),
  handler: async (ctx) => {
    const samples = [
      {
        offset: 0,
        mood: "good",
        body: "Planned the next Syncore dashboard pass and kept the notes offline."
      },
      {
        offset: 1,
        mood: "great",
        body: "The Electron app reopened with local state intact. That felt solid."
      },
      {
        offset: 2,
        mood: "okay",
        body: "Reviewed the active queries screen and wrote down two follow-ups."
      },
      {
        offset: 4,
        mood: "low",
        body: "Short entry. Needed a quieter day."
      },
      {
        offset: 6,
        mood: "rough",
        body: "Tested recovery after an app relaunch and confirmed the journal still worked."
      }
    ];
    const now = Date.now();
    let inserted = 0;

    for (const sample of samples) {
      const date = new Date();
      date.setDate(date.getDate() - sample.offset);
      const dateKey = date.toISOString().slice(0, 10);
      const existing = await ctx.db
        .query("entries")
        .withIndex("by_date", (q) => q.eq("date", dateKey))
        .first();
      if (existing) {
        continue;
      }
      await ctx.db.insert("entries", {
        date: dateKey,
        body: sample.body,
        mood: sample.mood,
        wordCount: countWords(sample.body),
        createdAt: now,
        updatedAt: now
      });
      inserted += 1;
    }

    return inserted;
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
