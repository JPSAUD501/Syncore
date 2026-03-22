# Syncore Component Authoring

Use this guidance when creating or reviewing a reusable Syncore component
package.

## Default Authoring Workflow

1. define the component's public goal in one sentence
2. decide what belongs in `public` versus `internal`
3. decide which tables the component owns
4. declare the minimum `requestedCapabilities`
5. declare `dependencies` only for cross-component needs
6. export a stable component object from the package entrypoint
7. test the package from a consumer app through `syncore/components.ts`

## Public Authoring Surface

Prefer public entrypoints:

- import component helpers from `syncorejs/components`
- import `query`, `mutation`, `action`, `defineSchema`, `defineTable`, and `v` from `syncorejs`

The authoring flow should center around:

- `defineComponent(...)`
- `createBindingFunctionReference(...)`

The consuming app, not the component package, is responsible for:

- `installComponent(...)`
- `defineComponents(...)`
- capability grants
- binding resolution

## What a Component Should Declare

A well-formed component should explicitly declare:

- `name`
- `version`
- `config` validator when config exists
- `requestedCapabilities`
- `dependencies`
- `schema`
- `public`
- `internal`
- `onStart` and `onStop` only when lifecycle hooks are necessary

## Visibility Rules

Use `public` for functions the host app or other components should call.

Use `internal` for helper functions that must remain private to the component.

Default to `internal` unless there is a concrete consumer.

## Dependencies and Bindings

If the component depends on another component, declare it in
`dependencies: string[]`.

Use binding references instead of hard-coding another component's install path:

```ts
import {
  createBindingFunctionReference,
  defineComponent
} from "syncorejs/components";
import { action, mutation, query, v, defineSchema, defineTable } from "syncorejs";

export default defineComponent({
  name: "cache",
  version: "0.1.0",
  requestedCapabilities: ["ownTables", "storage"],
  dependencies: ["clock"],
  schema: defineSchema({
    entries: defineTable({
      key: v.string(),
      value: v.any(),
      updatedAt: v.number()
    }).index("by_key", ["key"])
  }),
  public: {
    get: query({
      args: { key: v.string() },
      handler: async (ctx, args) =>
        ctx.db
          .query("entries")
          .withIndex("by_key", (q) => q.eq("key", args.key))
          .unique()
    })
  },
  internal: {
    revalidate: action({
      args: { key: v.string() },
      handler: async (ctx, args) => {
        await ctx.runQuery(
          createBindingFunctionReference("query", "clock", "now"),
          {}
        );
        return args.key;
      }
    })
  }
});
```

## Capabilities

Request only what the component actually needs.

Common capability families:

- core: `storage`, `scheduler`, `devtools`, `ownTables`, `publicExports`, `internalActions`
- host contracts such as `host:http` or `host:filesystem`

## Package Contract

Export a stable component object from the package entrypoint:

```ts
export { default as cacheComponent } from "./component";
```

The consuming app should be able to install it directly via package import plus
`installComponent({ component, source })`.

## Common Pitfalls

1. treating a component like a root app module with implicit global access
2. exposing helper internals publicly instead of keeping them in `internal`
3. forgetting to declare `dependencies` while using binding references
4. requesting broad capabilities by default instead of the minimum needed
5. coupling the component to a specific app layout instead of publishing a stable package contract
