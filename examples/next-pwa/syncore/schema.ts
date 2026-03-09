import { defineSchema, defineTable, v } from "syncore";

export default defineSchema({
  bookmarks: defineTable({
    url: v.string(),
    title: v.string(),
    description: v.string(),
    tag: v.string(),
    starred: v.boolean(),
    createdAt: v.number()
  })
    .index("by_tag", ["tag", "createdAt"])
    .index("by_starred", ["starred", "createdAt"])
    .searchIndex("search_bookmarks", {
      searchField: "title",
      filterFields: ["tag", "starred"]
    })
});
