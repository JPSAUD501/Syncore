-- Syncore migration 0001_init_planner.sql
-- previous: none
-- next: {"tables":[{"indexes":[{"fields":["taskId","createdAt"],"name":"by_task_created"}],"name":"artifacts","searchIndexes":[],"validator":{"kind":"object","shape":{"contentType":{"kind":"string"},"createdAt":{"kind":"number"},"kind":{"kind":"string"},"size":{"kind":"number"},"storageId":{"kind":"string"},"taskId":{"kind":"id","tableName":"tasks"},"title":{"kind":"string"}}}},{"indexes":[{"fields":["sortOrder"],"name":"by_sort"}],"name":"projects","searchIndexes":[],"validator":{"kind":"object","shape":{"archivedAt":{"inner":{"kind":"number"},"kind":"optional"},"color":{"kind":"string"},"createdAt":{"kind":"number"},"name":{"kind":"string"},"slug":{"kind":"string"},"sortOrder":{"kind":"number"}}}},{"indexes":[{"fields":["dueAt","status"],"name":"by_dueAt"},{"fields":["projectId","status","updatedAt"],"name":"by_project_status"},{"fields":["reminderAt","status"],"name":"by_reminderAt"},{"fields":["status","updatedAt"],"name":"by_status_updated"}],"name":"tasks","searchIndexes":[{"filterFields":["status","priority","projectId"],"name":"search_tasks","searchField":"searchText"}],"validator":{"kind":"object","shape":{"completedAt":{"inner":{"kind":"number"},"kind":"optional"},"createdAt":{"kind":"number"},"details":{"kind":"string"},"dueAt":{"inner":{"kind":"number"},"kind":"optional"},"priority":{"kind":"string"},"projectId":{"inner":{"kind":"id","tableName":"projects"},"kind":"optional"},"reminderAt":{"inner":{"kind":"number"},"kind":"optional"},"reminderJobId":{"inner":{"kind":"string"},"kind":"optional"},"searchText":{"kind":"string"},"status":{"kind":"string"},"title":{"kind":"string"},"updatedAt":{"kind":"number"}}}}],"version":1}

CREATE TABLE IF NOT EXISTS "artifacts" (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL,
  _json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_artifacts_by_task_created" ON "artifacts" (json_extract(_json, '$.taskId'), json_extract(_json, '$.createdAt'));
CREATE TABLE IF NOT EXISTS "projects" (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL,
  _json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_projects_by_sort" ON "projects" (json_extract(_json, '$.sortOrder'));
CREATE TABLE IF NOT EXISTS "tasks" (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL,
  _json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_tasks_by_dueAt" ON "tasks" (json_extract(_json, '$.dueAt'), json_extract(_json, '$.status'));
CREATE INDEX IF NOT EXISTS "idx_tasks_by_project_status" ON "tasks" (json_extract(_json, '$.projectId'), json_extract(_json, '$.status'), json_extract(_json, '$.updatedAt'));
CREATE INDEX IF NOT EXISTS "idx_tasks_by_reminderAt" ON "tasks" (json_extract(_json, '$.reminderAt'), json_extract(_json, '$.status'));
CREATE INDEX IF NOT EXISTS "idx_tasks_by_status_updated" ON "tasks" (json_extract(_json, '$.status'), json_extract(_json, '$.updatedAt'));
CREATE VIRTUAL TABLE IF NOT EXISTS "fts_tasks_search_tasks" USING fts5(_id UNINDEXED, search_value);
