# Syncore

Syncore is a local-first reactive backend toolkit for offline apps. It brings a Convex-like programming model to fully local runtimes backed by SQLite.

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
pnpm --filter @syncore/cli dev
```

Inside a user project, `syncore dev` also runs codegen, checks schema drift, applies local migrations, and keeps watching `syncore/` sources while the hub is alive.

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

The current DX model is:

- user code lives in `syncore/schema.ts` and `syncore/functions/**/*.ts`
- `npx syncore codegen` generates `syncore/_generated/api`, `syncore/_generated/functions`, and `syncore/_generated/server`
- React code imports typed references from `syncore/_generated/api`
- function files import server helpers from `syncore/_generated/server`

## Design references

The repository intentionally keeps `./reference/Convex` available during development. It is consulted as behavioral reference material, not copied product code.

## Additional docs

- [`docs/architecture.md`](D:\GitHub\Syncore\docs\architecture.md)
- [`docs/development.md`](D:\GitHub\Syncore\docs\development.md)
