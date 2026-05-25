import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  contacts: defineTable({
    name: s.string(),
    email: s.string(),
    company: s.string(),
    color: s.string(),
    favorite: s.optional(s.boolean()),
    createdAt: s.number()
  })
    .index("by_created", ["createdAt"])
    .searchIndex("search_name", { searchField: "name" })
});
