import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  habits: defineTable({
    name: s.string(),
    icon: s.string(),
    color: s.string(),
    archived: s.boolean(),
    createdAt: s.number()
  }).index("by_archived", ["archived", "createdAt"]),

  completions: defineTable({
    habitId: s.string(),
    date: s.string()
  })
    .index("by_habit_date", ["habitId", "date"])
    .index("by_date", ["date"])
});
