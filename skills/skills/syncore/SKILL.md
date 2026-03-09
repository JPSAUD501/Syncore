---
name: syncore
displayName: Syncore Development
description: Umbrella skill for Syncore development. Routes agents to the right sub-skill for functions, schema migrations, React hooks, CLI workflows, platform adapters, or local scheduler and storage features.
version: 1.1.0
author: Syncore
tags: [syncore, local-first, offline, sqlite, reactive]
---

# Syncore Development Skills

This is an index skill for Syncore development. Use the focused skills below when you need detailed guidance.

## Documentation Sources

Start with these repo-local sources:

- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/guides/syncore-vs-convex.md`
- `docs/quickstarts/react-web.md`
- `docs/quickstarts/expo.md`
- `docs/quickstarts/electron.md`
- `docs/quickstarts/next-pwa.md`
- `docs/quickstarts/node-script.md`
- `packages/*/AGENTS.md`
- `examples/*`

## Core Development

| Skill                       | Use When                                                                        |
| --------------------------- | ------------------------------------------------------------------------------- |
| `syncore-best-practices`    | You need project structure, DX rules, public-entrypoint guidance, or guardrails |
| `syncore-functions`         | You are writing or refactoring `query`, `mutation`, or `action` files           |
| `syncore-schema-migrations` | You are changing `syncore/schema.ts`, indexes, or migration files               |
| `syncore-react-realtime`    | You are wiring React hooks, providers, or watch lifecycles                      |

## Tooling And Runtime

| Skill                       | Use When                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `syncore-cli-codegen`       | You need `init`, `dev`, `codegen`, `doctor`, `import`, `seed`, or migrations       |
| `syncore-platform-adapters` | You are integrating Node scripts, Electron, browser workers, Expo, Next, or Svelte |
| `syncore-scheduler-storage` | You are using recurring jobs, `runAfter`, `runAt`, misfire policies, or storage    |

## Instructions

### Recommended Routing

1. Use `syncore-best-practices` first for broad project guidance.
2. Add `syncore-functions` when touching backend logic.
3. Add `syncore-schema-migrations` when changing data shape or indexes.
4. Add `syncore-react-realtime` when touching app-facing hooks or providers.
5. Add adapter or scheduler skills only when the task crosses those boundaries.

### How To Reason About Syncore

- Think of Syncore as a local-first runtime, not a hosted backend.
- Treat generated files as outputs of the CLI, not hand-maintained sources.
- Preserve end-to-end type flow from source function definitions into generated API references and app bindings.
- Prefer public `syncore/*` entrypoints for app-facing examples; use `@syncore/*` internals only when working inside the monorepo implementation.
- When a workaround is needed in examples, first check whether the real bug belongs in core, codegen, React, Svelte, or an adapter.

## Examples

### Choosing A Skill

- "Add a new reactive task list query" -> `syncore-functions`
- "Change a table and generate a safe migration" -> `syncore-schema-migrations`
- "Wire Syncore into a browser worker, Electron, or Next app" -> `syncore-platform-adapters`
- "Fix `useQuery(api.tasks.list)` inference" -> `syncore-react-realtime` and `syncore-functions`
- "Schedule a local reminder and store an attachment" -> `syncore-scheduler-storage`
- "Update `syncore dev` scaffolding or generated API output" -> `syncore-cli-codegen`

## Best Practices

- Start from repo docs before extrapolating from Convex mental models.
- Keep user-facing code in `syncore/` and integration code in the app shell.
- Prefer the smallest focused skill set that covers the current task.
- Remember that Syncore currently documents more than one app surface: React web, Expo, Electron, Next, Node scripts, browser ESM, and SvelteKit examples.

## References

- `skills/AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/guides/syncore-vs-convex.md`
