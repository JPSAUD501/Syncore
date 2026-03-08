# Syncore

Syncore is a local-first reactive backend toolkit for offline apps. It brings a Convex-like programming model to fully local runtimes backed by SQLite.

## Quick feel

The intended happy path is:

```bash
npx syncore dev
```

Inside a user project, `syncore dev` is the main development loop. If Syncore
has not been initialized yet, it scaffolds a minimal local backend first. Then
it regenerates `syncore/_generated/*`, checks schema drift, applies local
migrations, starts the local hub, and watches `syncore/` sources.

## Scope

Syncore targets offline-first applications that run entirely on-device:

- Electron and other Node-compatible desktop shells
- React Native / Expo apps
- Web apps that install once and then keep running locally

The production runtime stays inside the app. The only external development surface is the dev dashboard, which is excluded from final builds.

## Current state

This repository contains the v1 foundation:

- TypeScript monorepo with Turbo
- `syncore` core runtime and schema system
- React bindings in `@syncore/react`
- Node platform adapter in `@syncore/platform-node`
- Web, Expo, and Next bootstrap packages
- `@syncore/cli` with project scaffolding, code generation, and devtools hub
- Vite + Tailwind dashboard shell

The implementation is intentionally structured for long-term OSS maintenance: explicit interfaces, separated responsibilities, tests, and space for future plugins.

Published packages are built with `tsdown`. Static type-checking stays explicit via `tsc --noEmit`.

Platform status right now:

- Node/Electron: local SQLite + filesystem adapter is functional
- Web: SQLite WASM runtime with worker bridge and selectable OPFS / IndexedDB persistence is functional
- Expo: `expo-sqlite` + local file storage adapter is implemented
- Dashboard: shell and protocol wiring are functional; product UX is not finished

## Repository layout

- [`packages/core`](D:\GitHub\Syncore\packages\core): runtime, schema, scheduler, storage metadata, reactivity
- [`packages/schema`](D:\GitHub\Syncore\packages\schema): schema validators, table/schema definitions, snapshotting, and migration planning
- [`packages/react`](D:\GitHub\Syncore\packages\react): React hooks and provider
- [`packages/platform-node`](D:\GitHub\Syncore\packages\platform-node): Node/Electron runtime bootstrap and SQLite/filesystem adapters
- [`packages/platform-web`](D:\GitHub\Syncore\packages\platform-web): web bootstrap layer
- [`packages/platform-expo`](D:\GitHub\Syncore\packages\platform-expo): Expo bootstrap layer
- [`packages/next`](D:\GitHub\Syncore\packages\next): Next integration helpers
- [`packages/cli`](D:\GitHub\Syncore\packages\cli): `syncore` CLI
- [`apps/dashboard`](D:\GitHub\Syncore\apps\dashboard): dev dashboard shell
- [`examples`](D:\GitHub\Syncore\examples): target-platform examples
- [`reference/Convex`](D:\GitHub\Syncore\reference\Convex): reference material kept in-tree during development

## Development

Install dependencies and run the standard checks:

```bash
pnpm install
pnpm api:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:smoke
```

If public APIs change intentionally, refresh the checked-in API reports before committing:

```bash
pnpm api:update
```

Release metadata is managed with Changesets:

```bash
pnpm changeset
```

To remove generated build artifacts across the workspace:

```bash
pnpm clean
```

The dashboard shell can be started with:

```bash
npx syncore dev
```

Inside a user project, `syncore dev` is the main development loop. It can also
scaffold Syncore automatically when the project is still empty.

Smoke commands:

```bash
pnpm --filter @syncore/testing test:smoke:web
pnpm --filter @syncore/testing test:smoke:electron
pnpm --filter @syncore/testing test:smoke:expo
```

The Expo smoke runner skips cleanly when `adb` or an Android device/emulator is unavailable.

CI runs the same workspace quality gates plus the smoke suite for web, Electron, and environment-aware Expo coverage.

## Quickstarts

- [`docs/quickstarts/react-web.md`](D:\GitHub\Syncore\docs\quickstarts\react-web.md)
- [`docs/quickstarts/next-pwa.md`](D:\GitHub\Syncore\docs\quickstarts\next-pwa.md)
- [`docs/quickstarts/expo.md`](D:\GitHub\Syncore\docs\quickstarts\expo.md)
- [`docs/quickstarts/electron.md`](D:\GitHub\Syncore\docs\quickstarts\electron.md)
- [`docs/quickstarts/node-script.md`](D:\GitHub\Syncore\docs\quickstarts\node-script.md)

The current DX model is:

- user code lives in `syncore/schema.ts` and `syncore/functions/**/*.ts`
- `npx syncore dev` is the main happy path and auto-scaffolds when needed
- `npx syncore init --template <platform>` is available when you want explicit scaffolding
- `npx syncore dev` keeps `syncore/_generated/api`, `syncore/_generated/functions`, and `syncore/_generated/server` in sync during development
- `npx syncore codegen` is available for one-off generation without the full dev loop
- `npx syncore import --table tasks sampleData.jsonl` imports local sample data
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

The repository intentionally keeps `./reference/Convex` available during development. It is consulted as behavioral reference material, not copied product code.

## Additional docs

- [`docs/architecture.md`](D:\GitHub\Syncore\docs\architecture.md)
- [`docs/development.md`](D:\GitHub\Syncore\docs\development.md)
- [`docs/guides/syncore-vs-convex.md`](D:\GitHub\Syncore\docs\guides\syncore-vs-convex.md)
