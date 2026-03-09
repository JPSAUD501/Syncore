# Syncore Monorepo Guide

## Purpose

This repository builds a local-first application platform around a typed runtime, schema-driven functions, platform adapters, React bindings, examples, and integration tooling.

## Package Map

- `packages/core`: runtime, function references, scheduler, storage coordination, devtools events.
- `packages/schema`: validators, schema definitions, migration planning.
- `packages/cli`: init/codegen/migration/devtools hub commands.
- `packages/react`: React hooks and provider surface.
- `packages/platform-node`, `packages/platform-web`, `packages/platform-expo`, `packages/next`: platform-specific adapters.
- `packages/testing`: cross-adapter contracts and smoke coverage.
- `examples/*`: reference apps that double as integration fixtures.

## High-Risk Areas

- Typed DX changes span `packages/core`, `packages/cli`, generated `_generated/*`, React hooks, and adapter bridges. Validate all of them together.
- `syncore:codegen` is part of example lint/typecheck flows. Avoid solutions that rely on fragile `dist` state during parallel workspace tasks.
- Do not commit generated `src/**/*.d.ts` artifacts inside source trees. They can shadow `.ts` sources and break type resolution.

## Validation Commands

- Full workspace: `pnpm lint`, `pnpm typecheck`, `pnpm test`
- Public API surface: `pnpm api:check` to validate API reports, `pnpm api:update` after intentional exported API changes
- Focused packages: `pnpm --filter syncore test`, `pnpm --filter @syncore/cli test`, `pnpm --filter @syncore/react test`
- Examples: `pnpm --filter syncore-example-expo typecheck`, `pnpm --filter syncore-example-electron typecheck`, `pnpm --filter syncore-example-next-pwa build`

## API Extractor Workflow

- `pnpm api:check` runs the workspace API Extractor script in CI-style mode. Use it before opening a PR to confirm checked-in API reports still match the exported public surface.
- `pnpm api:update` runs the same script with `--local`, which refreshes the checked-in `packages/*/etc/*.api.md` baselines after an intentional public API change.
- The script builds the public packages first, then runs every package `api-extractor.json` config in sequence. Expect `packages/*/etc/*.api.md` files to change when exported types, functions, or entrypoints move.
- If your PR changes the public API, include the updated `etc/*.api.md` files in the same PR. If the API should not have changed, run `pnpm api:check` and fix the export/type regression instead of updating the baselines.

## Development Rules

- Prefer fixing DX regressions at the type source, not in examples.
- When editing codegen, assert both runtime output shape and generated source strings in CLI tests.
- When editing adapters, add tests for both happy-path data flow and error propagation.
- When editing exported types or entrypoints in published packages, run `pnpm api:update`, review the generated API report diff, and ensure `pnpm api:check` passes before the PR.
- Keep examples minimal and representative; they are fixtures for integration validation, not product demos.
