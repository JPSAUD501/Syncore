import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  notes: defineTable({
    body: v.string(),
    pinned: v.boolean()
  })
    .index("by_pinned", ["pinned"])
    .searchIndex("search_body", { searchField: "body" })
});
