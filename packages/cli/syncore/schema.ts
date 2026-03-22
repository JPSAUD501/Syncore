import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  tasks: defineTable({
    text: s.string(),
    done: s.boolean()
  }).index("by_done", ["done"])
});
