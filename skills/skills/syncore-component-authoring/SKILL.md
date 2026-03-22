---
name: syncore-component-authoring
description: Build reusable Syncore components, plugins, modules, or installable backend features with `defineComponent`, isolated schema and functions, explicit capabilities, public or internal exports, dependencies, bindings, and package-friendly authoring patterns.
---

# Syncore Component Authoring

Use this skill when creating or reviewing a reusable Syncore component package.
The goal is to help third-party developers build installable components that
fit the public Syncore runtime cleanly.

## Documentation Sources

Read these first from the current component package:

- `package.json`
- `tsconfig.json`
- component source files
- example consumer app if the package includes one
- installed `syncorejs` docs or type declarations

## Instructions

### Default Authoring Workflow

When building a new component package, work in this order:

1. Define the component's public goal in one sentence
2. Decide what belongs in `public` versus `internal`
3. Decide which tables the component owns
4. Declare the minimum `requestedCapabilities`
5. Declare `dependencies` only for cross-component needs
6. Export a stable component object from the package entrypoint
7. Test the package from a consumer app through `syncore/components.ts`

### Public Authoring Surface

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

### What A Component Should Declare

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

If any of these are unclear, stop and simplify the component before adding more
surface area.

### Visibility Rules

Use `public` for the host app or other components to call.

Use `internal` for helper functions that must remain private to the component.

Default to `internal` unless there is a concrete consumer for the function.

### Dependencies And Bindings

If the component depends on another component, declare it in
`dependencies: string[]`.

Inside the component, use binding references instead of hard-coding another
component's install path:

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

### Capabilities Must Stay Explicit

Request only what the component actually needs.

Common capability families are:

- core: `storage`, `scheduler`, `devtools`, `ownTables`, `publicExports`, `internalActions`
- host contracts such as `host:http` or `host:filesystem`

### Package Contract

The reusable package should export a stable component object:

```ts
export { default as cacheComponent } from "./component";
```

The consuming app should be able to install it via package import plus
`installComponent({ component, source })`.

Do not require the consuming app to import internal files from the component
package just to make installation work.

## Best Practices

- Keep the component self-contained and reusable across apps
- Separate public API from private implementation with `public` and `internal`
- Declare dependencies and bindings instead of importing another component directly
- Request only the capabilities the component actually needs
- Design the package export so it can be installed directly from npm
- Make the first installed version small and composable before adding options

## Common Pitfalls

1. Treating a component like a root app module with implicit global access
2. Exposing helper internals publicly instead of keeping them in `internal`
3. Forgetting to declare `dependencies` while using binding references
4. Requesting broad capabilities by default instead of the minimum needed
5. Coupling the component to a specific app layout instead of publishing a stable package contract

## References

- `package.json`
- component source files
- installed `syncorejs` docs or type declarations
