import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  habits: defineTable({
    name: v.string(),
    icon: v.string(),
    color: v.string(),
    archived: v.boolean(),
    createdAt: v.number()
  }).index("by_archived", ["archived", "createdAt"]),

  completions: defineTable({
    habitId: v.string(),
    date: v.string()
  })
    .index("by_habit_date", ["habitId", "date"])
    .index("by_date", ["date"])
});
