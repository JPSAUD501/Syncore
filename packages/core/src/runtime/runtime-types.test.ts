import { defineSchema, defineTable, s } from "@syncore/schema";
import { describe, expectTypeOf, it } from "vitest";
import type { QueryCtx } from "./runtime.js";

const tasksTable = defineTable({
  title: s.string(),
  status: s.enum(["todo", "done"] as const),
  projectId: s.nullable(s.id("projects"))
})
  .index("by_status", ["status"])
  .searchIndex("search_title", {
    searchField: "title",
    filterFields: ["status", "projectId"]
  });

const localSchema = defineSchema({
  tasks: tasksTable
});

describe("runtime query builder types", () => {
  it("preserves indexed field names and document shape", () => {
    expectTypeOf(localSchema.tables.tasks).toEqualTypeOf<typeof tasksTable>();
    expectTypeOf<typeof tasksTable["indexesByName"]>().toEqualTypeOf<{
      by_status: readonly ["status"];
    }>();
    expectTypeOf<typeof tasksTable["searchIndexesByName"]>().toEqualTypeOf<{
      search_title: {
        searchField: "title";
        filterFields: "status" | "projectId";
      };
    }>();
    type TaskRow = Awaited<ReturnType<typeof collectTasksByStatus>>[number];

    expectTypeOf<TaskRow["title"]>().toEqualTypeOf<string>();
    expectTypeOf<TaskRow["status"]>().toEqualTypeOf<"todo" | "done">();
    expectTypeOf<TaskRow["projectId"]>().toEqualTypeOf<string | null>();
  });
});

function collectTasksByStatus(ctx: QueryCtx<typeof localSchema>) {
  return ctx.db
    .query("tasks")
    .withIndex("by_status", (range) => range.eq("status", "todo"))
    .collect();
}

function assertRuntimeQueryBuilderTypeErrors(ctx: QueryCtx<typeof localSchema>) {
  // @ts-expect-error unknown index name
  ctx.db.query("tasks").withIndex("by_missing");
  // @ts-expect-error field not included in the index
  ctx.db.query("tasks").withIndex("by_status", (range) => range.eq("title", "syncore"));
  // @ts-expect-error unknown search index name
  ctx.db.query("tasks").withSearchIndex("search_missing", (search) =>
    search.search("title", "syncore")
  );
  ctx.db.query("tasks").withSearchIndex("search_title", (search) =>
    // @ts-expect-error wrong search field
    search.search("status", "todo")
  );
  ctx.db.query("tasks").withSearchIndex("search_title", (search) =>
    // @ts-expect-error title is not a filter field on this search index
    search.search("title", "syncore").eq("title", "syncore")
  );
}

void localSchema;
void collectTasksByStatus;
void assertRuntimeQueryBuilderTypeErrors;
