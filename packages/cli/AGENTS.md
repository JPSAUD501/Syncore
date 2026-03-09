# CLI And Codegen Guide

## Scope

`packages/cli` scaffolds projects, generates `_generated/*`, manages SQL migrations, and starts the devtools hub.

## Codegen Rules

- Generated `_generated/api.ts` must reference function definitions through `createFunctionReferenceFor<typeof ...>` so args/results flow from the source function.
- Generated `_generated/server.ts` must preserve typed overloads for both scalar validators and validator maps.
- Prefer `import type` in generated files whenever a symbol is used only in type position.

## Example Integration

- Examples run codegen from CLI source via `bun run --cwd ../../packages/cli tsx src/index.ts codegen`.
- Avoid changes that require the built CLI `dist` to exist during parallel lint/typecheck tasks.

## Tests To Run

- `bun run --filter @syncore/cli test`
- `bun run --filter @syncore/cli typecheck`

## Common Failure Modes

- Parallel example tasks can race if CLI scripts rebuild workspace packages and clean shared `dist` folders.
- String-template regressions in codegen are easiest to catch in CLI tests by asserting generated source content directly.
