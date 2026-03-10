# Syncore Skills

Agent skills for building local-first, reactive backends with Syncore.

## Overview

This directory adapts the skill pattern to Syncore's actual architecture:

- fully local runtimes backed by SQLite
- typed `query`, `mutation`, and `action` functions
- generated `_generated/*` APIs for end-to-end type flow
- platform adapters for browser workers, Node or Electron, Expo, Next, and Svelte
- local schema drift detection, SQL migrations, scheduler jobs, and file storage

The goal is straightforward: skills should point agents back to the source of
truth in this repo and generate code that matches Syncore's current public API.

## Source Of Truth

Prefer repo-local references over assumptions:

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/guides/syncore-vs-convex.md`
- `docs/quickstarts/*.md`
- `packages/*/AGENTS.md`
- `examples/*`

Use `references/convex-backend` only as behavioral background when the Syncore
repo does not already answer the question.

## Available Skills

| Skill                                                                  | Description                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [syncore](skills/syncore/SKILL.md)                                     | Umbrella index for Syncore development workflows                        |
| [syncore-best-practices](skills/syncore-best-practices/SKILL.md)       | Core DX rules, project layout, validation habits, and safety rails      |
| [syncore-functions](skills/syncore-functions/SKILL.md)                 | Queries, mutations, actions, references, and typed handler patterns     |
| [syncore-schema-migrations](skills/syncore-schema-migrations/SKILL.md) | Schema design, drift detection, snapshots, and SQL migrations           |
| [syncore-react-realtime](skills/syncore-react-realtime/SKILL.md)       | Provider setup, reactive hooks, skip semantics, and inference-safe APIs |
| [syncore-cli-codegen](skills/syncore-cli-codegen/SKILL.md)             | `syncorejs init`, `codegen`, `doctor`, migrations, `seed`, and `dev`    |
| [syncore-platform-adapters](skills/syncore-platform-adapters/SKILL.md) | Node, Electron, browser worker, Expo, Next, browser ESM, and Svelte     |
| [syncore-scheduler-storage](skills/syncore-scheduler-storage/SKILL.md) | Durable local scheduling, misfire policies, recurring jobs, and storage |

## Repository Structure

```text
skills/
|- AGENTS.md
|- README.md
|- docs.md
|- files.md
`- skills/
   |- syncore/
   |- syncore-best-practices/
   |- syncore-functions/
   |- syncore-schema-migrations/
   |- syncore-react-realtime/
   |- syncore-cli-codegen/
   |- syncore-platform-adapters/
   `- syncore-scheduler-storage/
```

## Skill Format

Each skill keeps the required `SKILL.md` frontmatter minimal:

```markdown
---
name: skill-name
description: What the skill does and when to use it
---
```

Optional UI metadata lives in `agents/openai.yaml`.

## Notes

- These skills are intentionally repo-local and documentation-first.
- They should not encourage editing generated files under `syncore/_generated`.
- They should prefer current Syncore APIs over Convex analogies whenever the products differ.
