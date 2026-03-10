import { defineSchema, defineTable, v } from "syncorejs";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    slug: v.string(),
    color: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
    archivedAt: v.optional(v.number())
  }).index("by_sort", ["sortOrder"]),
  tasks: defineTable({
    title: v.string(),
    details: v.string(),
    status: v.string(),
    priority: v.string(),
    projectId: v.optional(v.id("projects")),
    dueAt: v.optional(v.number()),
    reminderAt: v.optional(v.number()),
    reminderJobId: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    searchText: v.string()
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
    taskId: v.id("tasks"),
    kind: v.string(),
    title: v.string(),
    storageId: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number()
  }).index("by_task_created", ["taskId", "createdAt"])
});
