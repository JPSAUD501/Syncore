import { describe, expect, it } from "vitest";
import { defineSchema, defineTable } from "./definition.js";
import {
  createSchemaSnapshot,
  diffSchemaSnapshots,
  renderMigrationSql
} from "./planner.js";
import { v } from "./validators.js";

describe("schema planner", () => {
  it("creates statements for new tables and indexes", () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: v.string(),
        done: v.boolean()
      })
        .index("by_done", ["done"])
        .searchIndex("search_text", { searchField: "text" })
    });

    const snapshot = createSchemaSnapshot(schema);
    const plan = diffSchemaSnapshots(null, snapshot);

    expect(plan.statements).toHaveLength(3);
    expect(plan.destructiveChanges).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
  });

  it("flags validator changes as warnings and index removals as destructive", () => {
    const previous = createSchemaSnapshot(
      defineSchema({
        tasks: defineTable({
          text: v.string(),
          done: v.boolean()
        }).index("by_done", ["done"])
      })
    );

    const next = createSchemaSnapshot(
      defineSchema({
        tasks: defineTable({
          text: v.string(),
          status: v.string()
        })
      })
    );

    const plan = diffSchemaSnapshots(previous, next);

    expect(plan.warnings).toContain(
      'Validator changed for table "tasks". Existing rows are not rewritten automatically.'
    );
    expect(plan.destructiveChanges).toContain(
      'Index "tasks.by_done" was removed and requires a manual migration.'
    );
    expect(renderMigrationSql(plan)).toContain("-- destructive:");
  });
});
