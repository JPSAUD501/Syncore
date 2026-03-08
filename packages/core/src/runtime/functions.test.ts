import { describe, expect, expectTypeOf, it } from "vitest";
import { v } from "@syncore/schema";
import {
  action,
  type FunctionArgs,
  type FunctionReferenceFor,
  type FunctionResult,
  mutation,
  query
} from "./functions.js";

describe("function definition typing", () => {
  it("preserves object args and result types on generated references", () => {
    const definition = query({
      args: { title: v.string() },
      returns: v.object({ length: v.number() }),
      handler: async (_ctx, args) => ({ length: args.title.length })
    });

    type Reference = FunctionReferenceFor<typeof definition>;

    expect(definition.kind).toBe("query");
    expectTypeOf<FunctionArgs<Reference>>().toEqualTypeOf<{ title: string }>();
    expectTypeOf<FunctionResult<Reference>>().toEqualTypeOf<{ length: number }>();
  });

  it("preserves scalar validator overloads for args and return values", () => {
    const definition = mutation({
      args: v.string(),
      returns: v.number(),
      handler: async (_ctx, value) => value.length
    });

    type Reference = FunctionReferenceFor<typeof definition>;

    expect(definition.kind).toBe("mutation");
    expectTypeOf<FunctionArgs<Reference>>().toEqualTypeOf<string>();
    expectTypeOf<FunctionResult<Reference>>().toEqualTypeOf<number>();
  });

  it("keeps action result inference when args are optional object shapes", () => {
    const definition = action({
      args: {},
      returns: v.object({ ok: v.boolean() }),
      handler: async () => ({ ok: true })
    });

    type Reference = FunctionReferenceFor<typeof definition>;

    expect(definition.kind).toBe("action");
    expectTypeOf<FunctionResult<Reference>>().toEqualTypeOf<{ ok: boolean }>();
  });
});
