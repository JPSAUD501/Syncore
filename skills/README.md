# Syncore Skills

Agent skills for building local-first, reactive backends with Syncore, following the Agent Skills open format used in `reference/convexskills`.

## Overview

This directory adapts the Convex skill pattern to Syncore's actual architecture:

- fully local runtimes backed by SQLite
- typed `query`, `mutation`, and `action` functions
- generated `_generated/*` APIs for end-to-end type flow
- platform adapters for Electron, web workers, Expo, and Next PWA
- local schema drift detection, SQL migrations, scheduler jobs, and file storage

The goal is DX parity in spirit: skills should help agents reason from the source of truth in this repo and generate code that matches Syncore's current APIs.

## Source Of Truth

Prefer repo-local references over assumptions:

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/quickstarts/*.md`
- `packages/*/AGENTS.md`
- `examples/*`

## Available Skills

| Skill                                                                  | Description                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [syncore](skills/syncore/SKILL.md)                                     | Umbrella index for Syncore development workflows                        |
| [syncore-best-practices](skills/syncore-best-practices/SKILL.md)       | Core DX rules, project layout, and safety rails                         |
| [syncore-functions](skills/syncore-functions/SKILL.md)                 | Queries, mutations, actions, references, and typed handlers             |
| [syncore-schema-migrations](skills/syncore-schema-migrations/SKILL.md) | Schema design, drift detection, generated snapshots, and SQL migrations |
| [syncore-react-realtime](skills/syncore-react-realtime/SKILL.md)       | Provider setup, reactive hooks, and inferred query or mutation usage    |
| [syncore-cli-codegen](skills/syncore-cli-codegen/SKILL.md)             | `syncorejs init`, `codegen`, `doctor`, migrations, and `syncorejs dev`      |
| [syncore-platform-adapters](skills/syncore-platform-adapters/SKILL.md) | Electron, web worker, Expo, and Next PWA integration patterns           |
| [syncore-scheduler-storage](skills/syncore-scheduler-storage/SKILL.md) | Durable local scheduling, misfire policies, and file storage            |

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

Each skill follows the same high-level format used by the Convex reference set:

```markdown
---
name: skill-name
displayName: Human Name
description: What the skill does and when to use it
version: 1.0.0
author: Syncore
tags: [syncore, ...]
---

# Skill Name

## Documentation Sources

## Instructions

## Examples

## Best Practices

## References
```

## Notes

- These skills are intentionally repo-local and documentation-first.
- They should not encourage editing generated files under `syncore/_generated`.
- They should prefer current Syncore APIs over Convex analogies whenever the products differ.
