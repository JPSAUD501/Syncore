---
name: syncore-cli-codegen
description: Syncore CLI workflows for `syncorejs init`, `dev`, `codegen`, `doctor`, import, seed, and migrations. Use when working with generated API files, generated server files, generated schema or component files, app scaffolding, schema checks, or local app bootstrapping.
---

# Syncore CLI And Codegen

Use this skill when working on `syncorejs` CLI workflows, generated files, or
the developer loop inside a Syncore app.

## Documentation Sources

Read these first from the current project:

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/*`
- any app scripts that invoke `syncorejs`

## Instructions

### CLI Commands

The main CLI surface includes:

- `npx syncorejs init`
- `npx syncorejs codegen`
- `npx syncorejs doctor`
- `npx syncorejs import --table <table> <file>`
- `npx syncorejs seed --table <table>`
- `npx syncorejs seed --table <table> --file <file>`
- `npx syncorejs migrate:status`
- `npx syncorejs migrate:generate [name]`
- `npx syncorejs migrate:apply`
- `npx syncorejs dev`

### codegen

`syncorejs codegen` scans `syncore/functions/**/*.ts` and `syncore/components.ts`
when present, then generates:

- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/server.ts`
- `syncore/_generated/schema.ts`
- `syncore/_generated/components.ts`

### dev

`syncorejs dev` is the main local development loop. It can scaffold a missing
Syncore project, keep generated files fresh, check schema drift, apply local
migrations, and run the local dev workflow when supported by the app setup.

### Migrations

The CLI compares the current schema against a stored snapshot and renders SQL
for safe changes.

Typical flow:

```bash
npx syncorejs migrate:status
npx syncorejs migrate:generate add_notes_table
npx syncorejs migrate:apply
```

## Best Practices

- Treat codegen regressions as high-priority DX issues
- Keep generated files as outputs, never hand-maintained sources
- Preserve typed references in generated API files
- Use generated outputs to understand the effective public API of the app
- Document `syncorejs dev` as the happy path unless the task is specifically about one-off commands

## Common Pitfalls

1. Breaking type flow by emitting looser generated reference types
2. Fixing generated files manually instead of fixing source inputs
3. Forgetting that `syncore/components.ts` affects generated schema and API output
4. Treating migration SQL as unreviewed boilerplate
5. Assuming generated outputs are missing when the issue is actually a stale codegen run

## References

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/*`
