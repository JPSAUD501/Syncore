import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  todos: defineTable({
    title: v.string(),
    complete: v.boolean()
  })
    .index("by_complete", ["complete"])
    .searchIndex("search_title", { searchField: "title" })
});
