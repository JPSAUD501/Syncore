import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  projects: defineTable({
    name: s.string(),
    slug: s.string(),
    color: s.string(),
    sortOrder: s.number(),
    createdAt: s.number(),
    archivedAt: s.optional(s.number())
  }).index("by_sort", ["sortOrder"]),
  tasks: defineTable({
    title: s.string(),
    details: s.string(),
    status: s.string(),
    priority: s.string(),
    projectId: s.optional(s.id("projects")),
    dueAt: s.optional(s.number()),
    reminderAt: s.optional(s.number()),
    reminderJobId: s.optional(s.string()),
    completedAt: s.optional(s.number()),
    createdAt: s.number(),
    updatedAt: s.number(),
    searchText: s.string()
  })
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_project_status", ["projectId", "status", "updatedAt"])
    .index("by_dueAt", ["dueAt", "status"])
    .index("by_reminderAt", ["reminderAt", "status"])
    .searchIndex("search_tasks", {
      searchField: "searchText",
      filterFields: ["status", "priority", "projectId"]
    }),
  artifacts: defineTable({
    taskId: s.id("tasks"),
    kind: s.string(),
    title: s.string(),
    storageId: s.string(),
    contentType: s.string(),
    size: s.number(),
    createdAt: s.number()
  }).index("by_task_created", ["taskId", "createdAt"])
});
