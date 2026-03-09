import { defineSchema, defineTable, v } from "syncorejs";

export default defineSchema({
  notes: defineTable({
    title: v.string(),
    body: v.string(),
    color: v.string(),
    pinned: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_pinned_created", ["pinned", "createdAt"])
    .index("by_color", ["color", "createdAt"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["pinned"]
    })
});
