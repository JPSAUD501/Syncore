---
name: syncore
description: Umbrella skill for Syncore app, local backend, offline-first, and component development. Use when work spans multiple Syncore areas and you need to route into the right focused skill for functions, schema, migrations, generated API files, React hooks, CLI workflows, platform adapters, scheduler or storage behavior, or component and plugin workflows.
---

# Syncore Development Skills

Use this index skill to choose the right focused Syncore skill before making
changes in an app or component package that depends on `syncorejs`.

## Documentation Sources

Start with sources available in the current project:

- `package.json`
- `tsconfig.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/*`
- app bootstrap files that create the runtime or providers
- installed `syncorejs` package docs or type declarations available in the workspace

## Core Development

| Skill                         | Use When                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `syncore-best-practices`      | You need project structure, DX rules, public entrypoint guidance, or guardrails |
| `syncore-functions`           | You are writing or refactoring `query`, `mutation`, or `action` files           |
| `syncore-schema-migrations`   | You are changing `syncore/schema.ts`, indexes, search indexes, or migrations    |
| `syncore-react-realtime`      | You are wiring React hooks, providers, skip behavior, or watch lifecycles       |
| `syncore-components`          | The work is about components, plugins, manifests, capabilities, or bindings     |

## Tooling And Runtime

| Skill                         | Use When                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `syncore-cli-codegen`         | You need `init`, `dev`, `codegen`, `doctor`, `import`, `seed`, or migrations    |
| `syncore-platform-adapters`   | You are integrating Node, Electron, browser workers, Expo, Next, or Svelte      |
| `syncore-scheduler-storage`   | You are using recurring jobs, `runAfter`, `runAt`, misfire policies, or storage |

## Instructions

### First Five Minutes

When dropped into an unfamiliar Syncore project, inspect in this order:

1. `package.json` to confirm the installed `syncorejs` surface and app scripts
2. `syncore.config.ts` to understand project-level configuration
3. `syncore/schema.ts` and `syncore/components.ts` to understand data and installed components
4. `syncore/functions/**/*.ts` to understand behavior
5. `syncore/_generated/api.ts` and `syncore/_generated/components.ts` to confirm the effective public API
6. app bootstrap files to see which adapter and provider model the app uses

If any generated file is stale or missing, prefer running `npx syncorejs codegen`
or `npx syncorejs dev` instead of guessing the API shape.

### Recommended Routing

1. Start with `syncore-best-practices` for broad project guidance.
2. Add `syncore-functions` when touching backend logic.
3. Add `syncore-schema-migrations` when changing data shape or indexes.
4. Add `syncore-react-realtime` when touching React-facing hooks or providers.
5. Add `syncore-components` when the task mentions plugins, reusable modules, or `syncore/components.ts`.
6. Add adapter or scheduler skills only when the task crosses those boundaries.

### How To Reason About Syncore

- Think of Syncore as a local-first runtime, not a hosted backend.
- Treat generated files as outputs, not hand-maintained source files.
- Preserve end-to-end type flow from source definitions into generated references and app bindings.
- Prefer public `syncorejs/*` entrypoints over internal implementation details.
- If documentation is incomplete, inspect the installed `syncorejs` types and the app's generated files before guessing.
- If the task mentions "plugin", first decide whether it should be a reusable component or ordinary app code.

## Examples

### Choosing A Skill

- "Add a new reactive bookmarks query" -> `syncore-functions`
- "Change a table and generate a safe migration" -> `syncore-schema-migrations`
- "Wire Syncore into a browser worker, Electron, Expo, or Next app" -> `syncore-platform-adapters`
- "Fix `useQuery(api.notes.list)` inference or skip behavior" -> `syncore-react-realtime` and `syncore-functions`
- "Schedule a local reminder and store an attachment" -> `syncore-scheduler-storage`
- "Create or install a Syncore plugin/component" -> `syncore-components`
- "Update `syncorejs dev` scaffolding or generated API output" -> `syncore-cli-codegen`

## Best Practices

- Prefer the smallest focused skill set that covers the current task.
- Let the current app and installed package version define the source of truth.
- Use generated files to understand the effective public API seen by the app.
- Avoid assuming access to Syncore internal source code.

## References

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/*`
