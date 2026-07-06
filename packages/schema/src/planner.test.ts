import { describe, expect, it } from "vitest";
import { defineSchema, defineTable } from "./definition.js";
import {
  createSchemaSnapshot,
  diffSchemaSnapshots,
  getSchemaChangesBySeverity,
  parseSchemaSnapshot,
  renderMigrationSql
} from "./planner.js";
import { s } from "./validators.js";

describe("schema planner", () => {
  it("creates statements for new tables and indexes", () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
        .index("by_done", ["done"])
        .searchIndex("search_text", { searchField: "text" })
    });

    const snapshot = createSchemaSnapshot(schema);
    const plan = diffSchemaSnapshots(null, snapshot);

    expect(plan.statements).toHaveLength(3);
    expect(getSchemaChangesBySeverity(plan, "destructive")).toHaveLength(0);
    expect(getSchemaChangesBySeverity(plan, "warning")).toHaveLength(0);
    expect(plan.changes.map((change) => change.kind)).toEqual([
      "table-added",
      "index-added",
      "search-index-added"
    ]);
  });

  it("creates short deterministic snapshot hashes", () => {
    const schema = defineSchema({
      tasks: defineTable({
        text: s.string(),
        done: s.boolean()
      })
    });

    const first = createSchemaSnapshot(schema);
    const second = createSchemaSnapshot(schema);

    expect(first.hash).toMatch(/^sha256:[a-f0-9]{16}$/);
    expect(first.hash).toBe(second.hash);
    expect(first.hash.length).toBeLessThan(80);
  });

  it("flags field changes as warnings and removals as destructive", () => {
    const previous = createSchemaSnapshot(
      defineSchema({
        tasks: defineTable({
          text: s.string(),
          done: s.boolean()
        }).index("by_done", ["done"])
      })
    );

    const next = createSchemaSnapshot(
      defineSchema({
        tasks: defineTable({
          text: s.string(),
          status: s.string()
        })
      })
    );

    const plan = diffSchemaSnapshots(previous, next);
    const warnings = getSchemaChangesBySeverity(plan, "warning");
    const destructive = getSchemaChangesBySeverity(plan, "destructive");

    expect(warnings).toContainEqual(
      expect.objectContaining({
        kind: "field-added",
        table: "tasks",
        field: "status"
      })
    );
    expect(destructive).toContainEqual(
      expect.objectContaining({
        kind: "field-removed",
        table: "tasks",
        field: "done"
      })
    );
    expect(destructive).toContainEqual(
      expect.objectContaining({
        kind: "index-removed",
        table: "tasks",
        index: "by_done"
      })
    );
    expect(renderMigrationSql(plan)).toContain("-- destructive:");
  });

  it("captures field paths and codec storage metadata in the snapshot", () => {
    const schema = defineSchema({
      tasks: defineTable({
        title: s.string(),
        projectId: s.nullable(s.id("projects")),
        payload: s.union(
          s.object({
            kind: s.literal("note"),
            body: s.string()
          }),
          s.object({
            kind: s.literal("checklist"),
            itemCount: s.number()
          })
        ),
        dueAt: s.optional(
          s.codec(s.string(), {
            storage: s.number(),
            serialize: (value: string) => Date.parse(value),
            deserialize: (value: number) => new Date(value).toISOString()
          })
        )
      })
        .index("by_project", ["projectId"])
        .searchIndex("search_title", {
          searchField: "title",
          filterFields: ["projectId"]
        })
    });

    const snapshot = createSchemaSnapshot(schema);
    const taskTable = snapshot.tables[0];
    expect(taskTable?.fieldPaths).toEqual([
      "title",
      "projectId",
      "payload",
      "payload.kind",
      "payload.body",
      "payload.itemCount",
      "dueAt"
    ]);
    expect(taskTable?.fields).toEqual([
      {
        name: "dueAt",
        optional: true,
        validator: {
          kind: "codec",
          value: { kind: "string" },
          storage: { kind: "number" }
        },
        storage: { kind: "number" }
      },
      {
        name: "payload",
        optional: false,
        validator: {
          kind: "union",
          members: [
            {
              kind: "object",
              shape: {
                body: {
                  optional: false,
                  validator: { kind: "string" }
                },
                kind: {
                  optional: false,
                  validator: { kind: "literal", value: "note" }
                }
              }
            },
            {
              kind: "object",
              shape: {
                itemCount: {
                  optional: false,
                  validator: { kind: "number" }
                },
                kind: {
                  optional: false,
                  validator: { kind: "literal", value: "checklist" }
                }
              }
            }
          ]
        },
        storage: {
          kind: "union",
          members: [
            {
              kind: "object",
              shape: {
                body: {
                  optional: false,
                  validator: { kind: "string" }
                },
                kind: {
                  optional: false,
                  validator: { kind: "literal", value: "note" }
                }
              }
            },
            {
              kind: "object",
              shape: {
                itemCount: {
                  optional: false,
                  validator: { kind: "number" }
                },
                kind: {
                  optional: false,
                  validator: { kind: "literal", value: "checklist" }
                }
              }
            }
          ]
        }
      },
      {
        name: "projectId",
        optional: false,
        validator: {
          kind: "union",
          members: [
            { kind: "id", tableName: "projects" },
            { kind: "null" }
          ]
        },
        storage: {
          kind: "union",
          members: [
            { kind: "id", tableName: "projects" },
            { kind: "null" }
          ]
        }
      },
      {
        name: "title",
        optional: false,
        validator: { kind: "string" },
        storage: { kind: "string" }
      }
    ]);
  });

  it("rejects legacy snapshots instead of upgrading them", () => {
    const legacySource = JSON.stringify({
      formatVersion: 2,
      plannerVersion: 1,
      tables: [
        {
          name: "tasks",
          validator: {
            kind: "object",
            shape: {
              title: {
                optional: false,
                validator: { kind: "string" }
              }
            }
          },
          indexes: [],
          searchIndexes: []
        }
      ],
      hash: "legacy-hash"
    });

    expect(() => parseSchemaSnapshot(legacySource)).toThrow(
      "Invalid schema snapshot file."
    );
  });

  it("parses current snapshots only", () => {
    const snapshot = createSchemaSnapshot(
      defineSchema({
        tasks: defineTable({
          title: s.string()
        })
      })
    );

    expect(parseSchemaSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
