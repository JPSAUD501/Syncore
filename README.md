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
The public CLI always prints local URLs with `localhost`, and the `dev`
bootstrap is intentionally compact so the ready state is easy to scan.

Syncore should feel like Convex for local-first apps: one CLI that scaffolds,
explains the current project state, runs local functions, inspects local data,
and keeps generated types plus SQLite state in sync.

## CLI

The public CLI now centers on a small product surface:

```bash
npx syncorejs init
npx syncorejs dev
npx syncorejs doctor
npx syncorejs targets
npx syncorejs run <function> [args]
npx syncorejs data [table]
npx syncorejs export --path <path>
npx syncorejs import <path>
npx syncorejs logs
npx syncorejs migrate status
npx syncorejs migrate generate [name]
npx syncorejs migrate apply
npx syncorejs dashboard
npx syncorejs docs
```

Useful conventions:

- `--json` for machine-readable output
- `--cwd <path>` to target another package
- `--verbose` for extra diagnostics
- `--yes` for non-interactive confirmations
- `--no-interactive` for CI or scripts
- `--format pretty|json|jsonl` on read-style commands like `run`, `data`, and `logs`
- `--target project|client:<id>` on operational commands like `run`, `data`, `import`, and `export`

Recommended flow:

- `npx syncorejs init`
- `npx syncorejs dev`
- `npx syncorejs targets`
- `npx syncorejs run ...` / `data` / `logs`

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

## Project status / stability

Syncore is usable today, but the project is still early and evolving.

Current expectations:

- `syncorejs` is the supported public package surface
- core local-first runtime building blocks are functional across the main targets
- the CLI and examples are actively used to shape the product contract
- dashboard UX and some broader product ergonomics are still in progress

Stability should be read as:

- stable enough for active evaluation and early adopters
- not yet frozen as a mature long-term API in every area
- explicit API review matters when public behavior changes

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
- `npx syncorejs doctor` explains whether you are in an app package, a monorepo root, or an incomplete Syncore project
- `npx syncorejs targets` lists project and connected client targets with their capabilities
- `npx syncorejs run tasks/list` and `npx syncorejs run api.tasks.create '{"text":"Ship"}'` execute local functions directly
- `npx syncorejs data tasks --format json` inspects local SQLite rows without opening the dashboard
- `npx syncorejs export --table tasks --path tasks.jsonl` and `npx syncorejs import --table tasks tasks.jsonl` roundtrip local data
- `npx syncorejs migrate status|generate|apply` is the grouped migration surface
- `npx syncorejs dashboard` prints the local dashboard URL and `npx syncorejs docs` resolves the most relevant quickstart
- `npx syncorejs import --table tasks sampleData.jsonl` imports local sample data
- React code imports typed references from `syncore/_generated/api`
- function files import server helpers from `syncore/_generated/server`

Target model:

- `node` and `electron` usually expose a `project` target
- `react-web`, `next`, and `expo` use connected `client:<id>` targets
- `npx syncorejs targets` is the primary way to inspect what is currently available

## Getting help

Use the channel that matches the request:

- bugs and scoped feature requests: [GitHub Issues](https://github.com/JPSAUD501/Syncore/issues)
- usage questions and design discussion: [GitHub Discussions](https://github.com/JPSAUD501/Syncore/discussions)
- security-sensitive reports: [`SECURITY.md`](SECURITY.md)

Useful starting points:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/development.md`](docs/development.md)
- [`docs/quickstarts/react-web.md`](docs/quickstarts/react-web.md)
- [`docs/quickstarts/next-pwa.md`](docs/quickstarts/next-pwa.md)
- [`docs/quickstarts/expo.md`](docs/quickstarts/expo.md)
- [`docs/quickstarts/electron.md`](docs/quickstarts/electron.md)
- [`docs/quickstarts/node-script.md`](docs/quickstarts/node-script.md)

## Contributing

Contributions are welcome.

Default contribution model:

- small fixes, tests, and docs can go straight to a PR
- larger features, public API changes, and architectural shifts should start in an Issue or Discussion

Before opening a substantial PR, read:

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`SUPPORT.md`](SUPPORT.md)
- [`docs/open-source-guidelines.md`](docs/open-source-guidelines.md)

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
- [`docs/guides/cli-product-contract.md`](docs/guides/cli-product-contract.md)
- [`docs/guides/syncore-vs-convex.md`](docs/guides/syncore-vs-convex.md)
- [`docs/open-source-guidelines.md`](docs/open-source-guidelines.md)
