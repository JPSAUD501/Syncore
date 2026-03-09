---
name: syncore-best-practices
displayName: Syncore Best Practices
description: Guidelines for building production-ready Syncore apps covering project structure, generated files, typed DX, example usage, public entrypoints, and monorepo-aware validation habits.
version: 1.1.0
author: Syncore
tags: [syncore, best-practices, dx, codegen, local-first]
---

# Syncore Best Practices

Build Syncore applications around the current source of truth in this repository: local runtimes, generated typed APIs, thin app bindings, and platform-specific bootstrap layers.

## Documentation Sources

Read these first:

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/guides/syncore-vs-convex.md`
- `examples/AGENTS.md`
- `packages/core/AGENTS.md`
- `packages/cli/AGENTS.md`
- `packages/react/AGENTS.md`

## Instructions

### Project Shape

The intended app layout is:

```text
syncore/
  schema.ts
  functions/
    tasks.ts
  migrations/
  _generated/
syncore.config.ts
```

Keep concerns separated:

- `syncore/schema.ts` defines tables, indexes, and search indexes
- `syncore/functions/**/*.ts` defines `query`, `mutation`, and `action`
- `syncore/_generated/*` is CLI output
- app code imports typed references from `syncore/_generated/api`
- backend files import helpers from `syncore/_generated/server`

### Prefer The Current Happy Path

Inside an app, the main local loop is:

```bash
npx syncore dev
```

`syncore dev` can scaffold a missing Syncore project, keep generated files fresh, check schema drift, apply local migrations, and run the local hub.

Use `npx syncore init --template <platform>` when you want explicit scaffolding instead of auto-detection.

### Generated Files Are Outputs

Treat these as generated artifacts:

- `syncore/_generated/api`
- `syncore/_generated/functions`
- `syncore/_generated/server`

Do not hand-edit them. If they are wrong, fix:

- source functions
- schema validators
- CLI codegen
- runtime, React, or adapter inference

### Prefer Public Entry Points In App Code

User-facing code should normally import from public `syncore/*` entrypoints such as:

- `syncore`
- `syncore/react`
- `syncore/browser`
- `syncore/browser/react`
- `syncore/node`
- `syncore/node/ipc/react`
- `syncore/expo`
- `syncore/expo/react`
- `syncore/next`
- `syncore/next/config`
- `syncore/svelte`

Reach for `@syncore/*` package names mainly when editing monorepo internals.

### Optimize For DX At The Type Source

Syncore's DX depends on types flowing from source definitions into generated references and hooks.

Prefer this:

```tsx
const tasks = useQuery(api.tasks.list) ?? [];
const createTask = useMutation(api.tasks.create);
```

Be suspicious of this:

```tsx
const tasks = useQuery<{ _id: string; text: string }[]>(api.tasks.list) ?? [];
const createTask = useMutation<string>(api.tasks.create);
```

If manual generics become necessary in app code, investigate core, codegen, or adapter typing before normalizing the workaround.

### Let Examples Stay Small

Examples are integration fixtures, not product apps.

- keep them minimal
- keep them representative of public APIs
- do not hide DX bugs with one-off local annotations when the real fix belongs in shared packages

### Use Built-In Local Data Workflows

For local sample data, prefer CLI workflows over ad hoc SQL or edited generated artifacts:

- `npx syncore import --table <table> <file>` for explicit JSONL imports
- `npx syncore seed --table <table>` for conventional seed files under `syncore/seed`

### Validate Cross-Package Changes Together

DX changes often span:

- `packages/core`
- `packages/schema`
- `packages/cli`
- `packages/react`
- `packages/svelte`
- platform adapters
- examples

When you change a type boundary, verify all affected layers together.

## Examples

### Recommended Function File

```ts
import { mutation, query, v } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("desc").collect()
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { text: args.text, done: false })
});

export const toggleDone = mutation({
  args: { id: v.id("tasks"), done: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("tasks", args.id, { done: args.done });
    return null;
  }
});
```

### Recommended React Usage

```tsx
import { useMutation, useQuery } from "syncore/react";
import { api } from "../syncore/_generated/api";

function Tasks() {
  const tasks = useQuery(api.tasks.list) ?? [];
  const createTask = useMutation(api.tasks.create);

  return (
    <button onClick={() => void createTask({ text: "Work offline" })}>
      Add task
    </button>
  );
}
```

## Best Practices

- Keep user code under `syncore/` and generated code under `syncore/_generated/`
- Import server helpers from `../_generated/server` inside function files
- Import typed references from `syncore/_generated/api` in app code
- Prefer fixing inference in shared packages rather than adding manual generics in examples
- Treat `npx syncore dev` as the main local development loop
- Use examples as fixtures to confirm intended DX, not as a place to patch over shared regressions

## Common Pitfalls

1. Editing generated files directly instead of fixing codegen or source definitions
2. Solving type regressions with app-level casts instead of shared fixes
3. Forgetting that examples are smoke fixtures and must stay deterministic
4. Importing internal `@syncore/*` packages in app docs when the public `syncore/*` surface is the intended API
5. Assuming Convex conventions apply unchanged when Syncore's local runtime differs

## References

- `README.md`
- `docs/guides/syncore-vs-convex.md`
- `examples/AGENTS.md`
- `packages/core/AGENTS.md`
- `packages/cli/AGENTS.md`
- `packages/react/AGENTS.md`
