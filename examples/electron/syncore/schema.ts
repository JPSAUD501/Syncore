import { defineSchema, defineTable, v } from "syncorejs";

export default defineSchema({
  entries: defineTable({
    date: v.string(),
    body: v.string(),
    mood: v.string(),
    wordCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_date", ["date"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["mood"]
    })
});
