# Syncore CLI Product Contract

## Goals

- make the CLI feel like a finished product for local-first app development
- keep the command surface small and stable
- prefer clarity and predictability over hidden convenience

## Public Principles

- `syncorejs dev` is the main happy path
- `syncorejs targets` is the source of truth for operational context
- operational commands act on exactly one target
- public URLs are always rendered with `localhost`
- errors should explain what failed and what to run next

## Root UX

Root help should show the recommended flow:

- `init`
- `dev`
- `targets`
- `run`, `data`, and `logs`

## syncorejs dev

Startup should stay compact and phase-based:

- `Project`
- `Codegen`
- `Schema`
- `Hub`
- `Targets`

## Target Resolution

- `--target` always wins
- if exactly one compatible target exists, the CLI may use it automatically
- if multiple compatible targets exist:
  - TTY: prompt
  - non-TTY: fail and require `--target`
- the CLI does not persist the last chosen target

## Errors and Output

- avoid stack traces in the normal path
- keep error messages actionable
- keep `--json` stable for tooling
- `--jsonl` should emit one object per line with no extra framing

## Docs Expectations

- Node and Electron docs should explain `projectTarget`
- web, Next, and Expo docs should explain connected `client:<id>` targets
- docs should never imply that browser or device-backed templates operate on a project-local database
