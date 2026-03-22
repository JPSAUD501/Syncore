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
