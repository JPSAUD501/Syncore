import { mutation, query, s } from "../_generated/server";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** List all active (non-archived) habits. */
export const listHabits = query({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query("habits")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .order("asc")
      .collect()
});

/** List all completions (used to compute streaks / heat maps). */
export const listCompletions = query({
  args: {},
  handler: async (ctx) => ctx.db.query("completions").collect()
});

export const dashboard = query({
  args: {},
  handler: async (ctx) => {
    const habits = await ctx.db
      .query("habits")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const completions = await ctx.db.query("completions").collect();
    const today = todayStr();
    const completionDates = new Set(completions.map((item) => item.date));

    return {
      habitCount: habits.length,
      totalCompletions: completions.length,
      todayCompletions: completions.filter((item) => item.date === today).length,
      activeDays: completionDates.size,
      lastCompletedDate:
        completions.length === 0
          ? null
          : completions
              .map((item) => item.date)
              .sort()
              .at(-1) ?? null
    };
  }
});

/** Completions for a specific date. */
export const completionsForDate = query({
  args: { date: s.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query("completions")
      .withIndex("by_date", (q) => q.eq("date", args.date))
      .collect()
});

/** Create a new habit. */
export const createHabit = mutation({
  args: {
    name: s.string(),
    icon: s.string(),
    color: s.string()
  },
  handler: async (ctx, args) =>
    ctx.db.insert("habits", {
      name: args.name,
      icon: args.icon,
      color: args.color,
      archived: false,
      createdAt: Date.now()
    })
});

export const renameHabit = mutation({
  args: {
    id: s.string(),
    name: s.string()
  },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("habits", args.id, { name: args.name.trim() });
    return null;
  }
});

/** Toggle a habit completion for a given date. */
export const toggleCompletion = mutation({
  args: { habitId: s.string(), date: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("completions")
      .withIndex("by_habit_date", (q) =>
        q.eq("habitId", args.habitId).eq("date", args.date)
      )
      .first();

    if (existing) {
      await ctx.db.delete("completions", existing._id);
    } else {
      await ctx.db.insert("completions", {
        habitId: args.habitId,
        date: args.date
      });
    }
    return null;
  }
});

/** Archive (soft-delete) a habit. */
export const archiveHabit = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("habits", args.id, { archived: true });
    return null;
  }
});

export const seedDemo = mutation({
  args: {},
  returns: s.number(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("habits")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    if (existing.length > 0) {
      return 0;
    }

    const samples = [
      { name: "Read offline docs", icon: "\u{1F4DA}", color: "#5DE4C7" },
      { name: "Ship one local-first fix", icon: "\u{1F4BB}", color: "#7C93F3" },
      { name: "Evening walk", icon: "\u{1F6B6}", color: "#F2A65A" }
    ];
    let inserted = 0;
    const createdIds: string[] = [];
    for (const sample of samples) {
      const id = await ctx.db.insert("habits", {
        ...sample,
        archived: false,
        createdAt: Date.now() + inserted
      });
      createdIds.push(id);
      inserted += 1;
    }

    for (const [habitIndex, habitId] of createdIds.entries()) {
      for (let offset = habitIndex; offset < 7; offset += habitIndex + 2) {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        await ctx.db.insert("completions", {
          habitId,
          date: date.toISOString().slice(0, 10)
        });
      }
    }

    return inserted;
  }
});

/** Permanently remove a habit and its completions. */
export const removeHabit = mutation({
  args: { id: s.string() },
  returns: s.null(),
  handler: async (ctx, args) => {
    const completions = await ctx.db
      .query("completions")
      .withIndex("by_habit_date", (q) => q.eq("habitId", args.id))
      .collect();
    for (const c of completions) {
      await ctx.db.delete("completions", c._id);
    }
    await ctx.db.delete("habits", args.id);
    return null;
  }
});
