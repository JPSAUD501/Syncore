import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  notes: defineTable({
    title: s.string(),
    body: s.string(),
    color: s.string(),
    pinned: s.boolean(),
    createdAt: s.number(),
    updatedAt: s.number()
  })
    .index("by_pinned_created", ["pinned", "createdAt"])
    .index("by_color", ["color", "createdAt"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["pinned"]
    })
});
