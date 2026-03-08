import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  tasks: defineTable({
    text: v.string(),
    done: v.boolean()
  })
    .index("by_done", ["done"])
    .searchIndex("search_text", { searchField: "text" })
});
