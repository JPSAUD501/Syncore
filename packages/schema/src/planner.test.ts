import { describe, expect, it } from "vitest";
import { defineSchema, defineTable } from "./definition.js";
import {
  createSchemaSnapshot,
  diffSchemaSnapshots,
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
    expect(plan.destructiveChanges).toHaveLength(0);
    expect(plan.warnings).toHaveLength(0);
  });

  it("flags validator changes as warnings and index removals as destructive", () => {
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

    expect(plan.warnings).toContain(
      'Validator changed for table "tasks". Existing rows are not rewritten automatically.'
    );
    expect(plan.destructiveChanges).toContain(
      'Index "tasks.by_done" was removed and requires a manual migration.'
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

  it("upgrades legacy snapshots into the richer format", () => {
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

    const parsed = parseSchemaSnapshot(legacySource);

    expect(parsed.formatVersion).toBe(3);
    expect(parsed.plannerVersion).toBe(2);
    expect(parsed.tables[0]?.fieldPaths).toEqual(["title"]);
    expect(parsed.tables[0]?.fields).toEqual([
      {
        name: "title",
        optional: false,
        validator: { kind: "string" },
        storage: { kind: "string" }
      }
    ]);
  });

  it("upgrades legacy formatVersion 2 snapshots with raw object field validators", () => {
    const legacySource = JSON.stringify({
      formatVersion: 2,
      plannerVersion: 1,
      tables: [
        {
          name: "tasks",
          validator: {
            kind: "object",
            shape: {
              title: { kind: "string" },
              archivedAt: {
                kind: "optional",
                inner: { kind: "number" }
              }
            }
          },
          indexes: [],
          searchIndexes: []
        }
      ],
      hash: "legacy-hash"
    });

    const parsed = parseSchemaSnapshot(legacySource);

    expect(parsed.tables[0]?.fieldPaths).toEqual(["title", "archivedAt"]);
    expect(parsed.tables[0]?.fields).toEqual([
      {
        name: "archivedAt",
        optional: true,
        validator: { kind: "number" },
        storage: { kind: "number" }
      },
      {
        name: "title",
        optional: false,
        validator: { kind: "string" },
        storage: { kind: "string" }
      }
    ]);
  });
});
