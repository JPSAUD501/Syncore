---
name: syncore-best-practices
description: Guidelines for building production-ready Syncore apps and local-first backends. Use when you need project structure, generated-file rules, typed DX guardrails, public `syncorejs` entrypoint guidance, validation habits, or a sanity check on whether a workaround belongs in app code, component code, generated files, or bootstrap code.
---

# Syncore Best Practices

Build Syncore applications around the public `syncorejs` API, generated typed
artifacts, and thin platform-specific bootstrap layers.

## Documentation Sources

Read these first from the current app or package:

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/server.ts`
- app bootstrap files that create the runtime or provider layer

## Instructions

### Default Working Sequence

Use this sequence unless the task clearly requires something narrower:

1. Inspect `package.json` and `syncore.config.ts`
2. Read `syncore/schema.ts`, `syncore/components.ts`, and the relevant `syncore/functions/**/*.ts`
3. Read `syncore/_generated/api.ts` to confirm the app-visible API surface
4. If generated files look stale, run `npx syncorejs codegen`
5. Make source changes only in app or component files, not in `_generated/*`
6. Re-run codegen and any relevant app checks

### Project Shape

The intended app layout is:

```text
syncore/
  schema.ts
  components.ts
  functions/
    tasks.ts
  migrations/
  _generated/
syncore.config.ts
```

Keep concerns separated:

- `syncore/schema.ts` defines tables, indexes, and search indexes
- `syncore/components.ts` installs reusable components when the app uses them
- `syncore/functions/**/*.ts` defines `query`, `mutation`, and `action`
- `syncore/_generated/*` is CLI output
- app code imports typed references from `syncore/_generated/api`
- backend files import helpers from `syncore/_generated/server`

### Prefer The Happy Path

Inside an app, the main local loop is:

```bash
npx syncorejs dev
```

Use `npx syncorejs init --template <template>` when you want explicit
scaffolding instead of auto-detection.

When in doubt, prefer the workflow that keeps the generated files and schema
state consistent automatically over manual file edits.

### Generated Files Are Outputs

Treat these as generated artifacts:

- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/server.ts`
- `syncore/_generated/schema.ts`
- `syncore/_generated/components.ts`

Do not hand-edit them. If they are wrong, fix:

- source functions
- schema definitions
- component installs
- bootstrap wiring
- CLI or codegen usage

### Prefer Public Entry Points In App Code

User-facing code should normally import from public `syncorejs/*` entrypoints
such as:

- `syncorejs`
- `syncorejs/components`
- `syncorejs/react`
- `syncorejs/browser`
- `syncorejs/browser/react`
- `syncorejs/node`
- `syncorejs/node/ipc`
- `syncorejs/node/ipc/react`
- `syncorejs/expo`
- `syncorejs/expo/react`
- `syncorejs/next`
- `syncorejs/next/config`
- `syncorejs/svelte`

### Optimize For DX At The Type Source

Syncore's DX depends on types flowing from source definitions into generated
references and hooks.

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

If manual generics become necessary, first inspect the installed package types
and generated outputs before normalizing the workaround.

### Keep App Code And Component Code Distinct

Use app code for:

- app-specific schema
- app-specific functions
- install decisions in `syncore/components.ts`
- platform bootstrap

Use reusable component packages for:

- portable schema and functions
- explicit capabilities
- bindings and exports designed for reuse

If a feature is only needed by one app, default to app code first. Reach for a
reusable component only when the feature is meant to be installed across apps.

### Use Built-In Local Data Workflows

For local sample data, prefer CLI workflows:

- `npx syncorejs import --table <table> <file>`
- `npx syncorejs seed --table <table>`
- `npx syncorejs seed --table <table> --file <file>`

## Best Practices

- Keep user code under `syncore/` and generated code under `syncore/_generated/`
- Import server helpers from `../_generated/server` inside function files
- Import typed references from `syncore/_generated/api` in app code
- Prefer fixing issues at the source rather than adding casts in app code
- Treat `npx syncorejs dev` as the main local development loop
- Use `syncore/components.ts` only when the app installs reusable components

## Common Pitfalls

1. Editing generated files directly instead of fixing source inputs
2. Solving type regressions with app-level casts instead of inspecting generated outputs
3. Mixing app-specific code and reusable component code without a clear boundary
4. Importing internal implementation paths instead of `syncorejs/*`
5. Assuming hosted-backend patterns apply unchanged to Syncore's local runtime

## References

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/*`
