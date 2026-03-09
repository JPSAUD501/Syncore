# Development

## Standards

Syncore is being built as an open-source project from the start. That means:

- explicit public APIs
- narrow modules
- low coupling
- automated tests
- deterministic tooling
- documentation that contributors can follow

Package builds use `tsdown`. Static type-checking stays explicit via `tsc --noEmit`.

## Commands

```bash
bun install
bun run api:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:smoke
```

Use these companion commands during normal development:

- `bun run api:update`: refresh checked-in API Extractor reports after intentional public API changes
- `bun run changeset`: create the release note/version entry for a user-facing change
- `bun run clean`: remove generated build output from the workspace and examples

## Dev dashboard

The current dashboard is intentionally a shell. The protocol, connection model, and placeholder routes are already in place so a later UI/UX pass can focus on actual tooling workflows instead of wiring.

`syncore dev` is the main development loop inside an app project. It bootstraps codegen and migrations first, then starts the local hub/dashboard and watches `syncore.config.ts`, schema files, functions, and SQL migrations for changes.

Use `npx syncore codegen` when you only want a one-off refresh of generated files. For day-to-day app work, prefer leaving `npx syncore dev` running in a separate terminal.

## Reference material

The `reference/Convex` directory stays available while Syncore is under active development. It is used to study how Convex solved problems such as developer ergonomics, scheduling, and dashboard workflows, then adapt those ideas to a fully local architecture.

## Smoke tests

Smoke coverage is currently split by target:

- Next static/PWA: `bun run --filter @syncore/testing test:smoke:web`
- Electron: `bun run --filter @syncore/testing test:smoke:electron`
- Expo Android: `bun run --filter @syncore/testing test:smoke:expo`

Expo smoke is environment-aware. If `adb` or an Android device/emulator is not available, the
runner exits successfully with a skip message instead of failing the whole workspace.

## CI

The repository CI runs:

- `bun run api:check`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run test:smoke`

Electron and browser smoke jobs run under `xvfb` on Linux. Expo smoke keeps its skip behavior when Android tooling is unavailable.
