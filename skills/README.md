# Syncore Skills

Agent skills for building local-first, reactive applications and reusable
components with Syncore.

## Overview

This directory adapts the skill pattern to Syncore's public architecture:

- fully local runtimes backed by SQLite
- typed `query`, `mutation`, and `action` functions
- generated `_generated/*` APIs for end-to-end type flow
- platform adapters for browser workers, Node or Electron, Expo, Next, and Svelte
- local schema drift detection, SQL migrations, scheduler jobs, and file storage

The goal is straightforward: skills should help agents work in any app that
depends on `syncorejs`, without requiring access to Syncore internal source code.

## Source Of Truth

Prefer app-local sources and installed package surfaces over assumptions:

- `package.json`
- `tsconfig.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/migrations/*`
- `syncore/_generated/*`
- app bootstrap files
- installed `syncorejs` docs and type declarations

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
| [syncore-components](skills/syncore-components/SKILL.md)               | Umbrella index for Syncore components and plugin-style workflows         |
| [syncore-component-authoring](skills/syncore-component-authoring/SKILL.md) | Authoring reusable Syncore components and package contracts          |
| [syncore-component-integration](skills/syncore-component-integration/SKILL.md) | Installing, binding, and consuming Syncore components in apps      |

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
   |- syncore-components/
   |- syncore-component-authoring/
   |- syncore-component-integration/
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

- These skills are intentionally standalone and app-oriented.
- They should not encourage editing generated files under `syncore/_generated`.
- They should prefer public `syncorejs` APIs over internal implementation details.
