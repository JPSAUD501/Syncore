---
name: syncore-components
description: Umbrella skill for Syncore components, plugins, modules, and reusable backend features. Use when work involves authoring reusable components, installing or configuring them in `syncore/components.ts`, wiring capabilities or bindings, or debugging generated component APIs and component-scoped runtime behavior.
---

# Syncore Components

Use this skill when the task is about Syncore's first-class component system.
In Syncore, "plugins" should be modeled as installable components with their
own schema, functions, capabilities, and bindings.

## Documentation Sources

Start with sources available in the current app or package:

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/_generated/api.ts`
- `syncore/_generated/components.ts`
- installed `syncorejs` docs or type declarations

## Recommended Routing

| Skill                           | Use When                                                                  |
| ------------------------------- | ------------------------------------------------------------------------- |
| `syncore-component-authoring`   | You are creating or reviewing a reusable component/plugin package         |
| `syncore-component-integration` | You are installing, configuring, binding, or consuming a component        |
| `syncore-cli-codegen`           | The task touches `_generated/*`, `syncorejs codegen`, or manifest loading |
| `syncore-schema-migrations`     | A component changes tables, indexes, or migration planning                |
| `syncore-scheduler-storage`     | The component depends on scheduler or storage capabilities                |

## Instructions

### First Decision

When a request mentions plugins, modules, or reusable backend features, decide
which of these it really is:

1. ordinary app code inside `syncore/functions/**/*.ts`
2. a reusable component package
3. installing an existing component into `syncore/components.ts`

Do not jump to component authoring if the feature is app-specific and not meant
for reuse.

### Think In Components, Not Hooks

Treat the current Syncore plugin model as a component platform:

- the install manifest lives in `syncore/components.ts`
- reusable packages export `SyncoreComponent`
- generated outputs live under `syncore/_generated/*`
- root app functions still live under `api.*`
- installed component public functions live under `components.<alias>.*`

This distinction should stay visible in both code and generated API usage.

### Use The Current Public Surface

Prefer public entrypoints:

- `syncorejs/components` for component authoring helpers
- `syncorejs` for validators, function builders, and runtime primitives

### Keep The Mental Model Straight

Important boundaries:

- each component owns its own tables
- each component gets explicit capabilities
- each component exposes only `public` functions to the host app
- `internal` functions stay inside the component
- cross-component calls go through declared bindings, not direct imports

### Generated Files Are Outputs

When a task mentions installed components, these files matter:

- `syncore/components.ts`
- `syncore/_generated/components.ts`
- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/schema.ts`

Do not hand-edit generated outputs.

If the generated outputs and source manifest disagree, regenerate first and
debug the source inputs second.

## Best Practices

- Model plugins as first-class components, not ad hoc runtime extensions
- Keep component packages self-contained and installable through a manifest
- Prefer explicit capabilities and bindings over implicit global access
- Preserve the distinction between root `api` and installed `components`
- Let the current app and generated files define the effective public surface

## References

- `package.json`
- `syncore/components.ts`
- `syncore/_generated/components.ts`
- `syncore/_generated/api.ts`
