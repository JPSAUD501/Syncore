import { describe, expect, expectTypeOf, it } from "vitest";
import {
  defineTable,
  withoutSystemFields,
  type InferTableInput,
  type TableFieldPaths,
  type TableSearchIndexConfig
} from "./definition.js";
import { SyncoreValidationError, isSyncoreValidationError } from "./errors.js";
import {
  type FieldPaths,
  type Infer,
  type InferObjectInput,
  s
} from "./validators.js";

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
    expectTypeOf<
      TableSearchIndexConfig<typeof table, "search_title">["filterFields"]
    >().toEqualTypeOf<readonly ("status" | "projectId")[]>();
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

function captureError(run: () => unknown): SyncoreValidationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(SyncoreValidationError);
    return error as SyncoreValidationError;
  }
  throw new Error("Expected the call to throw.");
}

describe("unknown fields", () => {
  const settings = s.object({
    theme: s.enum(["light", "dark"] as const),
    zoom: s.optional(s.number())
  });

  it("rejects undeclared fields by default, naming the field", () => {
    const error = captureError(() =>
      settings.parse({ theme: "dark", zeroDataRetention: true }, "args")
    );
    expect(error.code).toBe("unknown_field");
    expect(error.path).toBe("args.zeroDataRetention");
    expect(error.message).toBe(
      "args.zeroDataRetention is not an allowed field (expected one of: theme, zoom)."
    );
    expect(isSyncoreValidationError(error)).toBe(true);
  });

  it("reports every undeclared field at once", () => {
    const error = captureError(() =>
      settings.parse({ theme: "dark", a: 1, b: 2 })
    );
    expect(error.code).toBe("unknown_field");
    expect(error.path).toBe("value");
    expect(error.issues?.map((issue) => issue.path)).toEqual([
      "value.a",
      "value.b"
    ]);
  });

  it("checks nested objects, arrays and records", () => {
    const validator = s.object({
      items: s.array(s.object({ id: s.string() })),
      byName: s.record(s.string(), s.object({ n: s.number() }))
    });
    expect(
      captureError(() =>
        validator.parse({ items: [{ id: "a" }, { id: "b", x: 1 }], byName: {} })
      ).path
    ).toBe("value.items[1].x");
    expect(
      captureError(() =>
        validator.parse({ items: [], byName: { k: { n: 1, extra: true } } })
      ).path
    ).toBe("value.byName.k.extra");
  });

  it("ignores undeclared keys whose value is undefined", () => {
    expect(settings.parse({ theme: "light", ghost: undefined })).toEqual({
      theme: "light"
    });
  });

  it("strips instead when the object opts out", () => {
    const lenient = s.object({ theme: s.string() }, { unknownKeys: "strip" });
    expect(lenient.unknownKeys).toBe("strip");
    expect(lenient.parse({ theme: "dark", extra: 1 })).toEqual({
      theme: "dark"
    });
  });

  it("lets a call-level option override the whole subtree", () => {
    const nested = s.object({ inner: s.object({ a: s.number() }) });
    expect(
      nested.parse({ inner: { a: 1, b: 2 }, c: 3 }, "value", {
        unknownKeys: "strip"
      })
    ).toEqual({ inner: { a: 1 } });
    const lenient = s.object({ a: s.number() }, { unknownKeys: "strip" });
    expect(
      captureError(() =>
        lenient.parse({ a: 1, b: 2 }, "value", { unknownKeys: "strict" })
      ).code
    ).toBe("unknown_field");
  });

  it("does not change the schema description", () => {
    expect(
      s.object({ a: s.number() }, { unknownKeys: "strip" }).describe()
    ).toEqual(s.object({ a: s.number() }).describe());
  });

  it("reads stored values leniently so removed fields stay readable", () => {
    const table = defineTable({ title: s.string() });
    expect(table.deserialize({ title: "a", removedField: 1 })).toEqual({
      title: "a"
    });
    expect(() => table.parse({ title: "a", removedField: 1 })).toThrow(
      /removedField is not an allowed field/
    );
  });

  it("reads a union as the member that matches exactly", () => {
    const validator = s.union(
      s.object({ a: s.number() }),
      s.object({ a: s.number(), b: s.string() })
    );
    expect(validator.deserialize({ a: 1, b: "kept" })).toEqual({
      a: 1,
      b: "kept"
    });
    expect(validator.deserialize({ a: 1, gone: true })).toEqual({ a: 1 });
    const inTable = defineTable({ payload: validator });
    expect(inTable.deserialize({ payload: { a: 1, b: "kept" } })).toEqual({
      payload: { a: 1, b: "kept" }
    });
  });

  it("reads codec values leniently", () => {
    const codec = s.codec(s.object({ a: s.number() }), {
      storage: s.string(),
      serialize: (value: { a: number }) => JSON.stringify(value),
      deserialize: (value: string) => JSON.parse(value) as { a: number }
    });
    expect(codec.deserialize(JSON.stringify({ a: 1, old: 2 }))).toEqual({
      a: 1
    });
  });

  it("surfaces the real error inside a nullable object", () => {
    const validator = s.object({
      profile: s.nullable(s.object({ name: s.string() }))
    });
    const error = captureError(() =>
      validator.parse({ profile: { name: "a", nickname: "b" } }, "args")
    );
    expect(error.code).toBe("unknown_field");
    expect(error.path).toBe("args.profile.nickname");
  });

  it("reports a union mismatch when no member gets further", () => {
    const error = captureError(() =>
      s.union(s.string(), s.number()).parse(true, "value.x")
    );
    expect(error.code).toBe("union_mismatch");
    expect(error.message).toBe("value.x did not match any union member.");
    expect(error.issues).toHaveLength(2);
  });

  it("reports missing fields and record keys with their own paths", () => {
    const missing = captureError(() => settings.parse({}, "args"));
    expect(missing.code).toBe("missing_field");
    expect(missing.path).toBe("args.theme");
    expect(missing.message).toBe("args.theme is required.");

    const record = s.record(s.enum(["a"] as const), s.number());
    const badKey = captureError(() => record.parse({ z: 1 }));
    expect(badKey.path).toBe("value.z");
    expect(badKey.code).toBe("invalid_value");
  });
});

describe("object helpers", () => {
  const settingsRow = s.object({
    key: s.literal("app"),
    theme: s.string(),
    zoom: s.optional(s.number())
  });

  it("omits, picks, extends and makes fields optional", () => {
    const fields = settingsRow.omit("key");
    expect(Object.keys(fields.shape)).toEqual(["theme", "zoom"]);
    expectTypeOf<Infer<typeof fields>>().toEqualTypeOf<{
      theme: string;
      zoom?: number;
    }>();

    const patch = fields.partial();
    expect(patch.parse({})).toEqual({});
    expect(patch.parse({ theme: "dark" })).toEqual({ theme: "dark" });
    expect(() => patch.parse({ key: "app" })).toThrow(
      /key is not an allowed field/
    );
    expectTypeOf<Infer<typeof patch>>().toEqualTypeOf<{
      theme?: string;
      zoom?: number;
    }>();

    const picked = settingsRow.pick("theme");
    expect(picked.parse({ theme: "x" })).toEqual({ theme: "x" });
    expectTypeOf<Infer<typeof picked>>().toEqualTypeOf<{ theme: string }>();

    const doc = settingsRow.extend({ _id: s.id("settings"), zoom: s.string() });
    expect(
      doc.parse({ key: "app", theme: "t", zoom: "1", _id: "abc" })
    ).toEqual({ key: "app", theme: "t", zoom: "1", _id: "abc" });
    expectTypeOf<Infer<typeof doc>>().toEqualTypeOf<{
      key: "app";
      theme: string;
      zoom: string;
      _id: string;
    }>();
  });

  it("keeps the unknown-field policy", () => {
    const lenient = s.object(
      { a: s.number(), b: s.number() },
      { unknownKeys: "strip" }
    );
    expect(lenient.omit("b").unknownKeys).toBe("strip");
    expect(lenient.partial().pick("a").unknownKeys).toBe("strip");
    expect(lenient.extend({ c: s.number() }).unknownKeys).toBe("strip");
  });

  it("rejects unknown field names at runtime", () => {
    // @ts-expect-error - "nope" is not a field of the shape.
    expect(() => settingsRow.omit("nope")).toThrow(/Cannot omit "nope"/);
    // @ts-expect-error - "nope" is not a field of the shape.
    expect(() => settingsRow.pick("nope")).toThrow(/Cannot pick "nope"/);
  });

  it("infers optional input fields that accept undefined", () => {
    type Input = InferObjectInput<(typeof settingsRow)["shape"]>;
    expectTypeOf<Input>().toEqualTypeOf<{
      key: "app";
      theme: string;
      zoom?: number | undefined;
    }>();
  });

  it("removes system fields from documents", () => {
    const doc = { _id: "1", _creationTime: 2, title: "t" };
    const copy = withoutSystemFields(doc);
    expect(copy).toEqual({ title: "t" });
    expectTypeOf(copy).toEqualTypeOf<{ title: string }>();
    expect(doc._id).toBe("1");
  });
});
