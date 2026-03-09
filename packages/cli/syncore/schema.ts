import { defineSchema, defineTable, v } from "syncorejs";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    done: v.boolean()
  }).index("by_done", ["done"])
});
