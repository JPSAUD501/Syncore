# Contributing to Syncore

Thanks for considering a contribution to Syncore.

Syncore is maintained as a pragmatic, maintainer-led open source project. We
optimize for a stable public package, strong DX, and changes that are easy to
review and maintain over time.

## Before You Open a PR

Use the following default workflow:

- Small fixes can go straight to a pull request.
- Docs, tests, typo fixes, and low-risk refactors can go straight to a pull request.
- Larger changes should start with a GitHub Issue or GitHub Discussion first.

Start with an Issue or Discussion before opening a PR when the change:

- adds or removes public API
- changes package behavior in a user-visible way
- alters scaffolding, codegen, migrations, or release flow
- spans multiple packages or examples
- introduces a new feature area or architectural direction

## Issues vs Discussions

Use GitHub Issues for:

- reproducible bugs
- scoped feature requests
- concrete follow-up work
- release regressions

Use GitHub Discussions for:

- usage questions
- architecture and product direction conversations
- proposal shaping before implementation
- open-ended DX feedback

If you are unsure, start with a Discussion.

## Local Setup

Syncore uses Bun for workspace commands and Node.js where the npm ecosystem
still requires it.

Minimum local setup:

- Bun `1.3.8`
- Node.js `22.18.0` or newer in the `22.x` line

Install dependencies:

```bash
bun install
```

## Core Commands

Run the full standard validation set:

```bash
bun run api:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:smoke
```

Useful companion commands:

```bash
bun run api:update
bun run changeset
bun run validate:pack:syncore
bun run clean
```

## Validation Expectations

Choose the smallest validation set that still proves the change safely.

Docs-only changes:

- run targeted checks if you changed commands, paths, or workflow instructions

Internal code changes:

- `bun run lint`
- `bun run typecheck`
- `bun run test`

Public API changes:

- `bun run api:check`
- `bun run api:update` if the API report change is intentional
- include the updated `packages/*/etc/*.api.md` files in the PR

Cross-package, adapter, example, or integration changes:

- run focused checks for the touched package(s)
- run the relevant example build or typecheck where practical
- run broader workspace validation if behavior crosses package boundaries

Release or packaging changes:

- `bun run build`
- `bun run validate:pack:syncore`

## Changesets

Syncore uses Changesets for release metadata.

Create a changeset when your PR changes published behavior of `syncorejs`,
including:

- user-visible features
- bug fixes that affect consumers
- public API changes
- packaging or release behavior that changes the published package

You usually do not need a changeset for:

- internal-only refactors
- tests with no published behavior change
- docs-only changes
- changes in workspace packages that do not alter the published `syncorejs` package

If a change intentionally updates the public API, include both:

- a changeset
- the updated API report files when applicable

## Pull Request Guidelines

Keep PRs reviewable:

- prefer one logical change per PR
- split unrelated cleanup into separate work
- include enough context for reviewers to understand intent quickly
- call out public API, migration, codegen, or release impact explicitly

Recommended branch naming:

- `fix/...`
- `feat/...`
- `docs/...`
- `refactor/...`
- `chore/...`

PR descriptions should clearly state:

- what changed
- why it changed
- which packages or examples are affected
- what validation was run
- whether a changeset is included
- whether public API behavior changed

## API and Compatibility Rules

- Treat `syncorejs` as the supported public package surface.
- Public API changes require explicit review.
- Breaking changes should be intentional, documented, and released through the normal Changesets flow.
- Do not commit generated `src/**/*.d.ts` artifacts inside source trees.
- Keep examples representative and minimal. They are integration fixtures, not product demos.

## Release Overview

Release flow, at a high level:

1. Normal PRs merge into `main`.
2. User-facing changes include a changeset.
3. The release workflow uses Changesets to open or update a release PR.
4. Merging that release PR publishes the package to npm.

Trusted publishing is configured through GitHub Actions and npm OIDC. The
workflow still sets up Node.js because npm publishing requires the npm toolchain,
while workspace validation continues to run through Bun.

## Project Norms

- Prefer fixing DX issues at the type source, not in examples.
- When changing codegen, validate both runtime shape and generated output.
- When changing adapters, cover both happy path and error propagation.
- When changing exported types or entrypoints, review the API report diff carefully.
- Avoid feature creep. Keep additions narrow and composable.

For maintainer-facing project policy, see
[`skills/syncore/references/project/open-source-guidelines.md`](skills/syncore/references/project/open-source-guidelines.md).
