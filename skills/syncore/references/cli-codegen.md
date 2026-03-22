# Syncore CLI and Codegen

## Main CLI Surface

The public CLI centers on:

- `npx syncorejs init`
- `npx syncorejs dev`
- `npx syncorejs doctor`
- `npx syncorejs targets`
- `npx syncorejs run <function> [args]`
- `npx syncorejs data [table]`
- `npx syncorejs export --path <path>`
- `npx syncorejs import <path>`
- `npx syncorejs logs`
- `npx syncorejs migrate status`
- `npx syncorejs migrate generate [name]`
- `npx syncorejs migrate apply`
- `npx syncorejs dashboard`
- `npx syncorejs docs`

Common generator and local-data workflows also include:

- `npx syncorejs import --table <table> <file>`
- `npx syncorejs seed --table <table>`
- `npx syncorejs seed --table <table> --file <file>`

## Product Contract

`syncorejs dev` is the main happy path.

Public principles:

- keep the command surface small and stable
- operational commands act on exactly one target
- `syncorejs targets` is the source of truth for operational context
- public URLs are always rendered with `localhost`
- errors should explain what failed and what to run next

## codegen

`syncorejs codegen` scans `syncore/functions/**/*.ts` and `syncore/components.ts`
when present, then generates:

- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/server.ts`
- `syncore/_generated/schema.ts`
- `syncore/_generated/components.ts`

## dev

`syncorejs dev` is the main local development loop. It can scaffold a missing
Syncore project, keep generated files fresh, check schema drift, apply local
migrations, and run the local dev workflow when supported by the app setup.

Startup should stay compact and phase-based:

- `Project`
- `Codegen`
- `Schema`
- `Hub`
- `Targets`

## Target Resolution

- `--target` always wins
- if exactly one compatible target exists, the CLI may use it automatically
- if multiple compatible targets exist:
  - TTY: prompt
  - non-TTY: fail and require `--target`
- the CLI does not persist the last chosen target

## Errors and Output

- avoid stack traces in the normal path
- suggest `npx syncorejs targets` when target selection is ambiguous or missing
- suggest `npx syncorejs dev` when the hub is missing
- keep `--json` stable for tooling
- `--jsonl` should emit one object per line with no extra framing

## Migrations

The CLI compares the current schema against a stored snapshot and renders SQL
for safe changes:

```bash
npx syncorejs migrate:status
npx syncorejs migrate:generate add_notes_table
npx syncorejs migrate:apply
```

## Best Practices

- treat codegen regressions as high-priority DX issues
- keep generated files as outputs, never hand-maintained sources
- document `syncorejs dev` as the happy path unless the task is specifically about one-off commands
- review migration SQL rather than treating it as boilerplate
