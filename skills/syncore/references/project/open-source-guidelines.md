# Syncore Open Source Guidelines

This document defines the maintainer-facing operating model for Syncore as an
open-source project.

## Project Goals

- keep `syncorejs` trustworthy as the public package surface
- keep DX strong across CLI, generated types, runtime, and examples
- prefer explicit contracts over implicit behavior
- treat examples as integration fixtures, not product demos
- keep the project approachable for external contributors without heavy process

## Maintainer Model

Syncore is maintainer-led. Maintainers decide direction, API shape, release
timing, and tradeoffs while still welcoming community input.

## Contribution Model

- PR-first is acceptable for small fixes, docs, tests, and low-risk refactors
- issue-first is expected for larger feature work, public API changes, and broader design shifts

Use issue-first when the change affects public API, runtime semantics, CLI,
codegen, migrations, packaging behavior, or multiple packages or examples.

## Compatibility Policy

For this repository, the practical public surface is `syncorejs`.

- breaking changes should be intentional and released explicitly
- public API changes require review and updated API reports
- examples may move faster than the public package, but should not become unsupported side surfaces

## Release Policy

- `main` is the integration branch
- `beta` is the prerelease branch
- user-facing package changes include a changeset
- stable release publishes to npm `latest`
- beta release publishes to npm `beta`

## Quality Gates

Repository standard:

- `bun run api:check`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run test:smoke`

## Review Expectations

- ask for the smallest safe validation set that proves the change
- require explicit callouts for API, migration, codegen, and release impact
- push broad speculative work back toward smaller, composable steps
- prefer behavior-level reasoning over surface-level churn
