-- Initialize bookmarks table for the Next PWA example
-- previous: none
-- next: {"tables":[{"indexes":[{"fields":["starred","createdAt"],"name":"by_starred"},{"fields":["tag","createdAt"],"name":"by_tag"}],"name":"bookmarks","searchIndexes":[{"filterFields":["tag","starred"],"name":"search_bookmarks","searchField":"title"}],"validator":{"kind":"object","shape":{"createdAt":{"kind":"number"},"description":{"kind":"string"},"starred":{"kind":"boolean"},"tag":{"kind":"string"},"title":{"kind":"string"},"url":{"kind":"string"}}}}],"version":1}

CREATE TABLE IF NOT EXISTS "bookmarks" (
  _id TEXT PRIMARY KEY,
  _creationTime INTEGER NOT NULL,
  _json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_bookmarks_by_starred" ON "bookmarks" (json_extract(_json, '$.starred'), json_extract(_json, '$.createdAt'));

CREATE INDEX IF NOT EXISTS "idx_bookmarks_by_tag" ON "bookmarks" (json_extract(_json, '$.tag'), json_extract(_json, '$.createdAt'));

CREATE VIRTUAL TABLE IF NOT EXISTS "fts_bookmarks_search_bookmarks" USING fts5(_id UNINDEXED, search_value);
