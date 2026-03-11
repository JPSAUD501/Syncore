# Syncore Open Source Guidelines

This document defines the maintainer-facing operating model for Syncore as an
open source project.

## Project Goals

Syncore is maintained around a few stable priorities:

- keep `syncorejs` trustworthy as the public package surface
- keep DX strong across CLI, generated types, runtime, and examples
- prefer explicit contracts over implicit behavior
- treat examples as integration fixtures, not product demos
- keep the project approachable for external contributors without adding heavy process

## Maintainer Model

Syncore is maintainer-led.

- maintainers decide direction, API shape, release timing, and tradeoffs
- community input is welcome and can strongly influence the roadmap
- the project does not promise governance by vote or consensus for all changes

This keeps product direction coherent while still welcoming external input.

## Contribution Model

Default contribution rules:

- PR-first is acceptable for small fixes, docs, tests, and low-risk refactors
- issue-first is expected for larger feature work, public API changes, and broader design shifts

Use issue-first when the change:

- affects public API or runtime semantics
- changes CLI, codegen, migration, or packaging behavior
- spans multiple packages or examples
- changes project policy or release behavior

The goal is to align on direction before implementation cost grows.

## Compatibility Policy

Syncore should remain conservative around compatibility for the published package.

- breaking changes should be intentional and released explicitly
- public API changes require review and updated API reports
- examples may move faster than the public package, but they should not become unsupported side surfaces
- internal refactors are encouraged when they simplify long-term maintenance without surprising users

For this repository, the practical public surface is `syncorejs`.

## Release Policy

Release management is based on Changesets.

- `main` is the integration branch
- `beta` is the prerelease branch
- normal PRs land on `main`
- user-facing package changes include a changeset
- the stable release workflow uses `changesets/action` to open or update a release PR on `main`
- the beta release workflow uses `changesets/action` in prerelease mode to open or update a beta release PR on `beta`
- merging the stable release PR publishes to npm `latest`
- merging the beta release PR publishes to npm `beta`

Channel expectations:

- `latest` is the supported production channel
- `beta` is an opt-in prerelease channel for validation before promotion to stable
- beta releases use semver prerelease identifiers such as `0.3.0-beta.0`

Trusted publishing:

- Bun runs workspace validation and most repository commands
- Node.js and npm remain in the release job because npm publishing and OIDC trusted publishing require the npm toolchain
- the workflow should not depend on a long-lived `NPM_TOKEN` when trusted publishing is active

## Quality Gates

The repository standard remains:

- `bun run api:check`
- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `bun run build`
- `bun run test:smoke`

Maintainers should keep quality and release conceptually separate:

- CI proves repository health
- release automation proves publication readiness

Packaging checks like `bun run validate:pack:syncore` belong in release-sensitive flows and can also be used in CI when touching packaging behavior.

## Triage Policy

Use a small, stable label taxonomy.

Core labels:

- `bug`
- `enhancement`
- `docs`
- `question`
- `discussion-needed`
- `good first issue`
- `help wanted`
- `breaking-change`
- `release`

Area labels:

- `cli`
- `core`
- `schema`
- `react`
- `platform-web`
- `platform-node`
- `platform-expo`
- `next`
- `svelte`
- `docs`
- `examples`

Priority model:

- P0: release blocker, broken publish flow, critical regression, or data loss risk
- P1: important user-facing regression or high-value bug
- P2: normal roadmap work and scoped feature requests
- P3: nice-to-have cleanup or deferred improvements

Issue routing:

- bugs go to Issues
- feature requests start in Issues when scoped, Discussions when still shaping
- broad questions go to Discussions
- security issues follow `SECURITY.md`, not public Issues

## Roadmap Policy

Keep roadmap process lightweight.

- use Issues for concrete work
- use Discussions for shaping and community feedback
- use milestones only when they help clarify a release theme or short-term focus
- avoid speculative backlog inflation

Prefer a small set of real, actionable issues over a long aspirational backlog.

## Review Expectations

Maintainers should optimize reviews for clarity and risk management.

- ask for the smallest safe validation set that proves the change
- require explicit callouts for API, migration, codegen, and release impact
- push broad speculative work back toward smaller, composable steps
- prefer behavior-level reasoning over surface-level churn

## Open Source UX Standards

A healthy Syncore repository should make the following easy to discover:

- how to install and try the project
- how to ask for help
- how to contribute safely
- how releases happen
- what is stable today versus still evolving

The repository front door is:

- `README.md` for users
- `CONTRIBUTING.md` for contributors
- `SUPPORT.md` for support routing
- `SECURITY.md` for vulnerability handling

## Practical Maintainer Defaults

- keep process complete but lightweight
- prefer explicit policy over maintainers repeating the same guidance in reviews
- avoid introducing RFC process for every change
- document standards once, then enforce them consistently

As the project grows, governance can evolve. For now, no separate
`GOVERNANCE.md` or `MAINTAINERS.md` is required.
