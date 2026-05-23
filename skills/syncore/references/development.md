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
npm install
npm run api:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:smoke
```

Companion commands:

- `npm run api:update`
- `npm run changeset`
- `npm run changeset:beta:enter`
- `npm run changeset:beta:exit`
- `npm run clean`

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

1. run `npm run api:update`
2. review the `packages/*/etc/*.api.md` diff
3. run `npm run api:check`

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

- Next static or PWA: `npm run test:smoke:web --workspace @syncore/testing`
- Electron: `npm run test:smoke:electron --workspace @syncore/testing`
- Expo Android: `npm run test:smoke:expo --workspace @syncore/testing`

Expo smoke is environment-aware. If `adb` or an Android device or emulator is
missing, the runner should skip cleanly instead of failing the workspace.

## CI

Repository CI runs:

- `npm run api:check`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run test:smoke`

## Release Channels

Syncore uses two release channels:

- `main` publishes `syncorejs` to npm `latest`
- `beta` publishes prereleases to npm `beta`

For maintainer policy and review expectations, also read
[project/open-source-guidelines.md](project/open-source-guidelines.md).
