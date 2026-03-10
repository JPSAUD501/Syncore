---
name: syncore
description: Umbrella skill for Syncore development. Use when work spans multiple Syncore areas and you need to route into the right focused skill for functions, schema migrations, React hooks, CLI workflows, platform adapters, or local scheduler and storage features.
---

# Syncore Development Skills

Use this index skill to choose the right focused Syncore skill before making
code changes.

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
| `syncore-react-realtime`    | You are wiring React hooks, providers, skip behavior, or watch lifecycles       |

## Tooling And Runtime

| Skill                       | Use When                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------- |
| `syncore-cli-codegen`       | You need `init`, `dev`, `codegen`, `doctor`, `import`, `seed`, or migration workflows           |
| `syncore-platform-adapters` | You are integrating Node scripts, Electron, browser workers, Expo, Next, browser ESM, or Svelte |
| `syncore-scheduler-storage` | You are using recurring jobs, `runAfter`, `runAt`, misfire policies, or storage                 |

## Instructions

### Recommended Routing

1. Start with `syncore-best-practices` for broad project guidance.
2. Add `syncore-functions` when touching backend logic.
3. Add `syncore-schema-migrations` when changing data shape or indexes.
4. Add `syncore-react-realtime` when touching app-facing hooks or providers.
5. Add adapter or scheduler skills only when the task crosses those boundaries.

### How To Reason About Syncore

- Think of Syncore as a local-first runtime, not a hosted backend.
- Treat generated files as CLI outputs, not hand-maintained sources.
- Preserve end-to-end type flow from source function definitions into generated API references and app bindings.
- Prefer public `syncorejs/*` entrypoints for app-facing docs and examples.
- Reach for `@syncore/*` packages mainly when editing monorepo internals.
- When a workaround is needed in an example, first check whether the real bug belongs in core, codegen, React, Svelte, or an adapter.

## Examples

### Choosing A Skill

- "Add a new reactive bookmarks query" -> `syncore-functions`
- "Change a table and generate a safe migration" -> `syncore-schema-migrations`
- "Wire Syncore into a browser worker, Electron, Expo, or Next app" -> `syncore-platform-adapters`
- "Fix `useQuery(api.notes.list)` inference or skip behavior" -> `syncore-react-realtime` and `syncore-functions`
- "Schedule a local reminder and store an attachment" -> `syncore-scheduler-storage`
- "Update `syncorejs dev` scaffolding or generated API output" -> `syncore-cli-codegen`

## Best Practices

- Start from repo docs before extrapolating from Convex mental models.
- Keep user-facing code in `syncore/` and integration code in the app shell.
- Prefer the smallest focused skill set that covers the current task.
- Remember that Syncore currently documents more than one app surface: React web, Expo, Electron, Next, Node scripts, browser ESM, and SvelteKit examples.

## References

- `skills/AGENTS.md`
- `skills/README.md`
- `README.md`
- `docs/architecture.md`
- `docs/development.md`
- `docs/guides/syncore-vs-convex.md`
