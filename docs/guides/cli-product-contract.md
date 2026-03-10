# Syncore CLI Product Contract

This document defines the UX contract for `syncorejs`.

## Goals

- Make the CLI feel like a finished product for local-first app development.
- Keep the command surface small and stable.
- Prefer clarity and predictability over hidden convenience.

## Public principles

- `syncorejs dev` is the main happy path.
- `syncorejs targets` is the source of truth for operational context.
- Operational commands act on exactly one target.
- Public URLs are always rendered with `localhost`.
- Errors should explain what failed and what to run next.

## Root UX

- Root help should show the recommended flow:
  - `init`
  - `dev`
  - `targets`
  - `run/data/logs`
- Commands should be grouped by intent, not just alphabetically.
- `--version` must be available from the root command.

## `syncorejs dev`

- Startup should begin with a single framing line.
- Bootstrap output should stay compact and phase-based.
- The visible startup phases are:
  - `Project`
  - `Codegen`
  - `Schema`
  - `Hub`
  - `Targets`
- Repeated URLs, template text, and redundant warnings should be avoided.
- The ready block should show:
  - detected template
  - whether `projectTarget` is configured
  - dashboard URL
  - devtools URL
  - target state
  - next recommended command

## Target resolution

- `--target` always wins.
- If exactly one compatible target exists, the CLI may use it automatically.
- If multiple compatible targets exist:
  - TTY: prompt
  - non-TTY: fail and require `--target`
- The CLI does not persist the last chosen target.

## Errors and next steps

- No stack trace in the normal path.
- Error messages should be actionable.
- When target selection is ambiguous or missing, suggest `npx syncorejs targets`.
- When the hub is missing, suggest `npx syncorejs dev`.

## Output formats

- Human-readable mode should optimize for scanning.
- `--json` should stay stable for tooling.
- `--jsonl` should emit one object per line with no extra framing.

## Docs expectations

- Node and Electron docs should explain `projectTarget`.
- Web, Next, and Expo docs should explain connected `client:<id>` targets.
- Docs should never imply that browser/device-backed templates operate on a project-local database.
