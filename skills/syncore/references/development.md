# Development

## Standards

Syncore is maintained as an open-source project with:

- explicit public APIs
- narrow modules
- low coupling
- automated tests
- deterministic tooling
- documentation contributors can follow

Package builds use `tsdown`. Static type-checking stays explicit via
`tsc --noEmit`.

## Workspace Commands

```bash
bun install
bun run api:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:smoke
```

Companion commands:

- `bun run api:update`
- `bun run changeset`
- `bun run changeset:beta:enter`
- `bun run changeset:beta:exit`
- `bun run clean`

## Validation Habits

Use the smallest safe validation set, but raise the bar when the change affects:

- public exports
- codegen output
- migrations
- adapter behavior
- example fixtures
- release or packaging flow

High-risk DX changes usually span `packages/core`, `packages/cli`,
`syncore/_generated/*`, React hooks, and platform bridges. Validate those
together.

When exported API changes are intentional:

1. run `bun run api:update`
2. review the `packages/*/etc/*.api.md` diff
3. run `bun run api:check`

Do not commit generated `src/**/*.d.ts` artifacts inside source trees.

## App Developer Loop

Inside an app project, prefer:

```bash
npx syncorejs dev
```

Use `npx syncorejs codegen` only for a one-off generation pass without the full
dev loop.

## Smoke Tests

Smoke coverage is split by target:

- Next static or PWA: `bun run --filter @syncore/testing test:smoke:web`
- Electron: `bun run --filter @syncore/testing test:smoke:electron`
- Expo Android: `bun run --filter @syncore/testing test:smoke:expo`

Expo smoke is environment-aware. If `adb` or an Android device or emulator is
missing, the runner should skip cleanly instead of failing the workspace.

## CI

Repository CI runs:

- `bun run api:check`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run test:smoke`

## Release Channels

Syncore uses two release channels:

- `main` publishes `syncorejs` to npm `latest`
- `beta` publishes prereleases to npm `beta`

For maintainer policy and review expectations, also read
[project/open-source-guidelines.md](project/open-source-guidelines.md).
