import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defineTable,
  type InferTableInput,
  type TableFieldPaths
} from "./definition.js";
import { type FieldPaths, s } from "./validators.js";

const isoDateCodec = s.codec(s.string(), {
  storage: s.number(),
  serialize: (value: string) => Date.parse(value),
  deserialize: (value: number) => new Date(value).toISOString()
});

describe("schema validators", () => {
  it("infers structured documents and field paths", () => {
    const validator = s.object({
      title: s.string(),
      status: s.enum(["todo", "done"] as const),
      projectId: s.nullable(s.id("projects")),
      metrics: s.record(s.string(), s.number()),
      dueAt: s.optional(isoDateCodec),
      payload: s.union(
        s.object({
          kind: s.literal("note"),
          body: s.string()
        }),
        s.object({
          kind: s.literal("checklist"),
          itemCount: s.number()
        })
      )
    });

    expectTypeOf<FieldPaths<typeof validator>>().toEqualTypeOf<
      | "title"
      | "status"
      | "projectId"
      | "metrics"
      | "dueAt"
      | "payload"
      | "payload.kind"
      | "payload.body"
      | "payload.itemCount"
    >();
    expect(
      validator.parse({
        title: "Ship Syncore",
        status: "todo",
        projectId: null,
        metrics: { score: 1 },
        payload: { kind: "note", body: "Document schema" }
      }).status
    ).toBe("todo");
  });

  it("serializes and deserializes codec fields", () => {
    const table = defineTable({
      title: s.string(),
      dueAt: s.optional(isoDateCodec)
    });

    const serialized = table.serialize({
      title: "Ship Syncore",
      dueAt: "2026-03-22T10:00:00.000Z"
    });
    expect(serialized).toEqual({
      title: "Ship Syncore",
      dueAt: Date.parse("2026-03-22T10:00:00.000Z")
    });

    const deserialized = table.deserialize(serialized);
    expect(deserialized).toEqual({
      title: "Ship Syncore",
      dueAt: "2026-03-22T10:00:00.000Z"
    });
  });

  it("keeps typed indexes and search indexes tied to field paths", () => {
    const table = defineTable({
      title: s.string(),
      status: s.enum(["todo", "done"] as const),
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
      )
    })
      .index("by_status", ["status"])
      .index("by_payload_kind", ["payload.kind"])
      .searchIndex("search_title", {
        searchField: "title",
        filterFields: ["status", "projectId"]
      });

    expectTypeOf<TableFieldPaths<typeof table>>().toEqualTypeOf<
      | "title"
      | "status"
      | "projectId"
      | "payload"
      | "payload.kind"
      | "payload.body"
      | "payload.itemCount"
    >();
    expect(table.indexes.map((index) => index.name)).toEqual([
      "by_status",
      "by_payload_kind"
    ]);
    type TableInput = InferTableInput<typeof table>;
    expectTypeOf<TableInput["title"]>().toEqualTypeOf<string>();
    expectTypeOf<TableInput["status"]>().toEqualTypeOf<"todo" | "done">();
    expectTypeOf<TableInput["projectId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<TableInput["payload"]["kind"]>().toEqualTypeOf<
      "note" | "checklist"
    >();
  });
});

function assertSchemaTypeErrors() {
  const table = defineTable({
    title: s.string(),
    status: s.enum(["todo", "done"] as const),
    payload: s.union(
      s.object({
        kind: s.literal("note"),
        body: s.string()
      }),
      s.object({
        kind: s.literal("checklist"),
        itemCount: s.number()
      })
    )
  });

  table.index("by_status", ["status"]);
  table.searchIndex("search_title", { searchField: "title" });

  // @ts-expect-error invalid field path
  table.index("by_missing", ["missing"]);
  // @ts-expect-error invalid nested path
  table.index("by_payload_items", ["payload.items"]);
  // @ts-expect-error invalid nested path
  table.searchIndex("search_missing", { searchField: "payload.missing" });
}

void assertSchemaTypeErrors;
