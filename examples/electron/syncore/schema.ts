import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  entries: defineTable({
    date: s.string(),
    body: s.string(),
    mood: s.string(),
    wordCount: s.number(),
    createdAt: s.number(),
    updatedAt: s.number()
  })
    .index("by_date", ["date"])
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["mood"]
    }),
  entryAttachments: defineTable({
    entryId: s.id("entries"),
    fileName: s.string(),
    contentType: s.string(),
    size: s.number(),
    storageId: s.string(),
    createdAt: s.number()
  }).index("by_entry", ["entryId", "createdAt"])
});
