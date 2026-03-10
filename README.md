# Syncore

Syncore is a local-first reactive backend toolkit for offline apps. It brings a
Convex-like programming model to fully local runtimes backed by SQLite.

## Install

```bash
npm add syncorejs
```

## Quick feel

The intended happy path is:

```bash
npx syncorejs dev
```

Inside an app project, `syncorejs dev` is the main development loop. If
Syncore has not been initialized yet, it scaffolds a minimal local backend
first. Then it regenerates `syncore/_generated/*`, checks schema drift, applies
local migrations, starts the local hub, and watches `syncore/` sources.

## Scope

Syncore targets offline-first applications that run entirely on-device:

- Electron and other Node-compatible desktop shells
- React Native / Expo apps
- Web apps that install once and then keep running locally

The production runtime stays inside the app. The only external development
surface is the dev dashboard, which is excluded from final builds.

## Current state

This repository contains the v1 foundation:

- TypeScript monorepo with Turbo
- `syncorejs` core runtime and schema system
- React bindings in `syncorejs/react`
- platform adapters for Node, web, Expo, Next, and Svelte
- `syncorejs` CLI with project scaffolding, code generation, and devtools hub
- Vite + Tailwind dashboard shell

The implementation is intentionally structured for long-term OSS maintenance:
explicit interfaces, separated responsibilities, tests, and space for future
plugins.

Published packages are built with `tsdown`. Static type-checking stays explicit
via `tsc --noEmit`.

Platform status right now:

- Node/Electron: local SQLite + filesystem adapter is functional
- Web: SQLite WASM runtime with worker bridge and selectable OPFS / IndexedDB persistence is functional
- Expo: `expo-sqlite` + local file storage adapter is implemented
- Dashboard: shell and protocol wiring are functional; product UX is not finished

## Repository layout

- [`packages/core`](packages/core): runtime, scheduler, storage metadata, typed references, and reactivity
- [`packages/schema`](packages/schema): validators, table or schema definitions, snapshots, and migration planning
- [`packages/react`](packages/react): React hooks and provider
- [`packages/platform-node`](packages/platform-node): Node or Electron bootstrap, SQLite, filesystem, and IPC adapters
- [`packages/platform-web`](packages/platform-web): browser bootstrap, SQL.js, worker bridge, and persistence adapters
- [`packages/platform-expo`](packages/platform-expo): Expo bootstrap helpers
- [`packages/next`](packages/next): Next integration helpers
- [`packages/svelte`](packages/svelte): Svelte bindings
- [`packages/cli`](packages/cli): `syncorejs` CLI source
- [`packages/testing`](packages/testing): cross-adapter contract and smoke coverage
- [`packages/syncore`](packages/syncore): public package that re-exports the supported app-facing entrypoints
- [`apps/dashboard`](apps/dashboard): dev dashboard shell
- [`examples`](examples): target-platform examples and smoke fixtures
- [`references/convex-backend`](references/convex-backend): upstream behavioral reference material kept in-tree during development

## Development

Install dependencies and run the standard checks:

```bash
bun install
bun run api:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:smoke
```

If public APIs change intentionally, refresh the checked-in API reports before
committing:

```bash
bun run api:update
```

Release metadata is managed with Changesets:

```bash
bun run changeset
```

To remove generated build artifacts across the workspace:

```bash
bun run clean
```

Inside an app project, `npx syncorejs dev` is the main development loop. It can
also scaffold Syncore automatically when the project is still empty.

Smoke commands:

```bash
bun run --filter @syncore/testing test:smoke:web
bun run --filter @syncore/testing test:smoke:electron
bun run --filter @syncore/testing test:smoke:expo
```

The Expo smoke runner skips cleanly when `adb` or an Android device or emulator
is unavailable.

CI runs the same workspace quality gates plus the smoke suite for web, Electron,
and environment-aware Expo coverage.

## Quickstarts

- [`docs/quickstarts/react-web.md`](docs/quickstarts/react-web.md)
- [`docs/quickstarts/next-pwa.md`](docs/quickstarts/next-pwa.md)
- [`docs/quickstarts/expo.md`](docs/quickstarts/expo.md)
- [`docs/quickstarts/electron.md`](docs/quickstarts/electron.md)
- [`docs/quickstarts/node-script.md`](docs/quickstarts/node-script.md)

The current DX model is:

- user code lives in `syncore/schema.ts` and `syncore/functions/**/*.ts`
- `npx syncorejs dev` is the main happy path and auto-scaffolds when needed
- `npx syncorejs init --template <minimal|node|react-web|expo|electron|next>` is available when you want explicit scaffolding
- `npx syncorejs dev` keeps `syncore/_generated/api`, `syncore/_generated/functions`, and `syncore/_generated/server` in sync during development
- `npx syncorejs codegen` is available for one-off generation without the full dev loop
- `npx syncorejs import --table tasks sampleData.jsonl` imports local sample data
- React code imports typed references from `syncore/_generated/api`
- function files import server helpers from `syncore/_generated/server`

## How Syncore differs from Convex

Syncore keeps the Convex-style programming model, but the runtime is local to
the app instead of living in a remote deployment.

- functions are still declared with `query`, `mutation`, and `action`
- clients still call typed references from generated `api.*`
- the data lives in local SQLite or local browser persistence instead of a hosted backend
- platform helpers hide most of the worker, IPC, and bootstrap setup needed for offline runtimes

## Design references

The repository intentionally keeps `./references/convex-backend` available
during development. It is consulted as behavioral reference material, not copied
product code.

## Additional docs

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/development.md`](docs/development.md)
- [`docs/guides/syncore-vs-convex.md`](docs/guides/syncore-vs-convex.md)
