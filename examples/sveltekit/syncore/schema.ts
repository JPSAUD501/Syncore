import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  todos: defineTable({
    text: v.string(),
    done: v.boolean()
  }).index("by_done", ["done"])
});
