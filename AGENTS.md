# Syncore Monorepo Guide

## Purpose

This repository builds a local-first application platform around a typed runtime, schema-driven functions, platform adapters, React bindings, examples, and integration tooling.

## Package Map

- `packages/core`: runtime, function references, scheduler, storage coordination, devtools events.
- `packages/schema`: schema builders, data-model definitions, field-path typing, and migration planning.
- `packages/cli`: init/codegen/migration/devtools hub commands.
- `packages/react`: React hooks and provider surface.
- `packages/platform-node`, `packages/platform-web`, `packages/platform-expo`, `packages/next`: platform-specific adapters.
- `packages/testing`: cross-adapter contracts and smoke coverage.
- `examples/*`: reference apps that double as integration fixtures.

## High-Risk Areas

- Typed DX changes span `packages/core`, `packages/cli`, generated `_generated/*`, React hooks, and adapter bridges. Validate all of them together.
- `syncorejs:codegen` is part of example lint/typecheck flows. Avoid solutions that rely on fragile `dist` state during parallel workspace tasks.
- Do not commit generated `src/**/*.d.ts` artifacts inside source trees. They can shadow `.ts` sources and break type resolution.

## Validation Commands

- Full workspace: `bun run lint`, `bun run typecheck`, `bun run test`
- Public API surface: `bun run api:check` to validate API reports, `bun run api:update` after intentional exported API changes
- Focused packages: `bun run --filter syncore test`, `bun run --filter @syncore/cli test`, `bun run --filter @syncore/react test`
- Examples: `bun run --filter syncore-example-expo typecheck`, `bun run --filter syncore-example-electron typecheck`, `bun run --filter syncore-example-next-pwa build`

## API Extractor Workflow

- `bun run api:check` runs the workspace API Extractor script in CI-style mode. Use it before opening a PR to confirm checked-in API reports still match the exported public surface.
- `bun run api:update` runs the same script with `--local`, which refreshes the checked-in `packages/*/etc/*.api.md` baselines after an intentional public API change.
- The script builds the public packages first, then runs every package `api-extractor.json` config in sequence. Expect `packages/*/etc/*.api.md` files to change when exported types, functions, or entrypoints move.
- If your PR changes the public API, include the updated `etc/*.api.md` files in the same PR. If the API should not have changed, run `bun run api:check` and fix the export/type regression instead of updating the baselines.

## Development Rules

- Prefer fixing DX regressions at the type source, not in examples.
- When editing codegen, assert both runtime output shape and generated source strings in CLI tests.
- When editing adapters, add tests for both happy-path data flow and error propagation.
- When editing exported types or entrypoints in published packages, run `bun run api:update`, review the generated API report diff, and ensure `bun run api:check` passes before the PR.
- Keep examples minimal and representative; they are fixtures for integration validation, not product demos.
- Prefer `s.*` schema builders and structured document fields over `any`-shaped payloads.
- Treat schema work as data-model work first: document shape, field paths, indexes, and codecs should stay explicit and typed.
- Do not introduce Zod into Syncore core. Use Convex as a reference for type-system and schema design, not as a runtime dependency.
- When updating Syncore skills or skill references for this repo, edit the versioned files under `./skills/*`. Do not treat `C:\Users\{{USER}}\.agents\skills\*` or any other local path as the source of truth for monorepo changes.
