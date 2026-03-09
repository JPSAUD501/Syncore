# Syncore Skills

Agent skills for building production-ready local-first applications with Syncore, following the Agent Skills open format.

## Syncore Documentation Index

IMPORTANT: Prefer retrieval-led reasoning over pretraining-led reasoning for Syncore tasks.

For Syncore work, read the repository docs and package guides before relying on assumptions.

```text
[Syncore Docs]|repo-local
|overview:{README.md,docs/architecture.md,docs/development.md,docs/guides/syncore-vs-convex.md}
|quickstarts:{docs/quickstarts/react-web.md,docs/quickstarts/expo.md,docs/quickstarts/electron.md,docs/quickstarts/next-pwa.md,docs/quickstarts/node-script.md}
|packages:{packages/core/AGENTS.md,packages/schema/AGENTS.md,packages/cli/AGENTS.md,packages/react/AGENTS.md,packages/platform-node/AGENTS.md,packages/platform-web/AGENTS.md,packages/testing/AGENTS.md}
|examples:{examples/README.md,examples/browser-esm,examples/electron,examples/expo,examples/next-pwa,examples/sveltekit}
|reference:{reference/Convex,reference/convexskills}
```

When working on Syncore code, treat the repo as the source of truth for architecture, public API shape, and DX goals.

## Overview

This directory provides two complementary layers for AI coding agents:

1. Passive context in this file for cross-cutting Syncore knowledge
2. On-demand skills for focused workflows such as functions, schema migrations, React hooks, adapters, and local scheduling

## Available Skills

| Skill                                                                  | Description                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [syncore](skills/syncore/SKILL.md)                                     | Umbrella index for Syncore development workflows                      |
| [syncore-best-practices](skills/syncore-best-practices/SKILL.md)       | Project structure, DX rules, and common pitfalls                      |
| [syncore-functions](skills/syncore-functions/SKILL.md)                 | Queries, mutations, actions, query builders, and typed references     |
| [syncore-schema-migrations](skills/syncore-schema-migrations/SKILL.md) | Schema evolution, drift safety, snapshots, and SQL migration flow     |
| [syncore-react-realtime](skills/syncore-react-realtime/SKILL.md)       | React providers, reactive hooks, loading states, and watch lifecycles |
| [syncore-cli-codegen](skills/syncore-cli-codegen/SKILL.md)             | CLI commands, scaffolding, generated files, and the dev loop          |
| [syncore-platform-adapters](skills/syncore-platform-adapters/SKILL.md) | Node, Electron, web, Expo, Next, and Svelte integration               |
| [syncore-scheduler-storage](skills/syncore-scheduler-storage/SKILL.md) | Scheduler jobs, recurring work, misfire policies, and file storage    |

## Skill Format

Each skill follows the Agent Skills specification with YAML frontmatter:

```markdown
---
name: skill-name
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

## Key Syncore Concepts

### Function Types

| Type       | Purpose                       | Database                         | External IO |
| ---------- | ----------------------------- | -------------------------------- | ----------- |
| `query`    | Read reactive data            | Read-only                        | No          |
| `mutation` | Transactional writes          | Read/Write                       | No          |
| `action`   | Side effects and integrations | Via `runQuery` and `runMutation` | Yes         |

### Runtime Model

Syncore keeps the product runtime inside the app:

- core owns typed references, validation, reactivity, scheduler state, storage metadata, and devtools events
- platform adapters provide environment-specific IO such as SQLite, files, workers, IPC, and lifecycle hooks
- React and Svelte bindings stay thin over `SyncoreClient`
- codegen flows types from source function definitions into `syncore/_generated/api`

### Current Developer Loop

Inside an app project:

- user code lives in `syncore/schema.ts` and `syncore/functions/**/*.ts`
- `npx syncore dev` is the main happy path and auto-scaffolds a missing Syncore project
- `npx syncore init --template <minimal|node|react-web|expo|electron|next>` is available for explicit scaffolding
- `npx syncore codegen` generates `_generated/api`, `_generated/functions`, and `_generated/server`
- `npx syncore migrate:status`, `migrate:generate [name]`, and `migrate:apply` manage schema drift, `_schema_snapshot.json`, and SQL
- `npx syncore import --table <table> <file>` and `npx syncore seed --table <table>` load local sample data

Recurring jobs are configured through runtime or bootstrap `scheduler` options. Syncore currently does not auto-load a special `syncore/crons.ts` file.

## DO NOT

- Do not edit files in `syncore/_generated/`
- Do not assume Convex docs describe Syncore APIs exactly
- Do not rely on built `dist` output for example codegen flows in this monorepo
- Do not add DX workarounds in examples when the real bug belongs in core, codegen, React, or adapters

## Quick Reference

### Typical Function File

```ts
import { mutation, query, v } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) =>
    ctx.db.query("tasks").withIndex("by_done").order("asc").collect()
});

export const create = mutation({
  args: { text: v.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { text: args.text, done: false })
});
```

### Typical Client Usage

```tsx
import { useMutation, useQuery } from "syncore/react";
import { api } from "../syncore/_generated/api";

function Tasks() {
  const tasks = useQuery(api.tasks.list) ?? [];
  const createTask = useMutation(api.tasks.create);

  return (
    <button onClick={() => void createTask({ text: "Work offline" })}>
      Add task
    </button>
  );
}
```

## References

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/guides/syncore-vs-convex.md`
- `packages/core/AGENTS.md`
- `packages/cli/AGENTS.md`
- `packages/react/AGENTS.md`
