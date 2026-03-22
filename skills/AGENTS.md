# Syncore Skills

Agent skills for building production-ready local-first applications and reusable
components with Syncore, following the Agent Skills open format.

## Syncore Documentation Index

IMPORTANT: Prefer retrieval-led reasoning over pretraining-led reasoning for
Syncore tasks.

For Syncore work, read the current app and installed package surface before
relying on assumptions.

```text
[Syncore App Context]|project-local
|config:{package.json,tsconfig.json,syncore.config.ts}
|source:{syncore/schema.ts,syncore/components.ts,syncore/functions/**/*.ts}
|generated:{syncore/_generated/api.ts,syncore/_generated/functions.ts,syncore/_generated/server.ts,syncore/_generated/schema.ts,syncore/_generated/components.ts}
|runtime:{app bootstrap files,providers,workers,main process entrypoints}
|dependency:{installed syncorejs docs and type declarations}
```

When working on Syncore code, treat the app and installed `syncorejs` version
as the source of truth for public API shape and DX expectations.

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
| [syncore-components](skills/syncore-components/SKILL.md)               | Umbrella index for Syncore components and plugin-style workflows      |
| [syncore-component-authoring](skills/syncore-component-authoring/SKILL.md) | Authoring reusable Syncore components and package contracts       |
| [syncore-component-integration](skills/syncore-component-integration/SKILL.md) | Installing, binding, and consuming Syncore components in apps   |

## Skill Format

Each skill follows the current skill format with minimal YAML frontmatter:

```markdown
---
name: skill-name
description: What the skill does and when to use it
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

- the app defines schema, functions, optional components, and bootstrap wiring
- platform adapters provide environment-specific IO such as SQLite, files, workers, IPC, and lifecycle hooks
- React and Svelte bindings stay thin over the generated API and client surface
- codegen flows types from source function definitions into `syncore/_generated/api`

### Current Developer Loop

Inside an app project:

- user code lives in `syncore/schema.ts`, `syncore/components.ts`, and `syncore/functions/**/*.ts`
- `npx syncorejs dev` is the main happy path and auto-scaffolds a missing Syncore project
- `npx syncorejs init --template <minimal|node|react-web|expo|electron|next>` is available for explicit scaffolding
- `npx syncorejs codegen` generates `_generated/api`, `_generated/functions`, `_generated/server`, `_generated/schema`, and `_generated/components`
- `npx syncorejs migrate:status`, `migrate:generate [name]`, and `migrate:apply` manage schema drift, `_schema_snapshot.json`, and SQL
- `npx syncorejs import --table <table> <file>` and `npx syncorejs seed --table <table>` load local sample data

Recurring jobs are configured through runtime or bootstrap `scheduler` options.
Syncore currently does not auto-load a special `syncore/crons.ts` file.

## DO NOT

- Do not edit files in `syncore/_generated/`
- Do not assume Convex docs describe Syncore APIs exactly
- Do not rely on undocumented internal implementation details when public `syncorejs` APIs exist
- Do not add app-level workarounds before checking the installed package surface and generated outputs

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
import { useMutation, useQuery } from "syncorejs/react";
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

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/*`
