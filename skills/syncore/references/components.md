# Syncore Components

Use the component model when the feature is meant to be reusable across apps.
In Syncore, "plugins" should be modeled as installable components with their
own schema, functions, capabilities, and bindings.

## First Decision

When a request mentions plugins, modules, or reusable backend features, decide
which of these it really is:

1. ordinary app code inside `syncore/functions/**/*.ts`
2. a reusable component package
3. installing an existing component into `syncore/components.ts`

Do not jump to component authoring if the feature is app-specific and not meant
for reuse.

## Mental Model

Treat the current Syncore plugin model as a component platform:

- the install manifest lives in `syncore/components.ts`
- reusable packages export `SyncoreComponent`
- generated outputs live under `syncore/_generated/*`
- root app functions still live under `api.*`
- installed component public functions live under `components.<alias>.*`

Important boundaries:

- each component owns its own tables
- each component gets explicit capabilities
- each component exposes only `public` functions to the host app
- `internal` functions stay inside the component
- cross-component calls go through declared bindings, not direct imports

## Public Surface

Prefer public entrypoints:

- `syncorejs/components` for component authoring helpers
- `syncorejs` for validators, function builders, and runtime primitives

## Generated Files Are Outputs

When a task mentions installed components, these files matter:

- `syncore/components.ts`
- `syncore/_generated/components.ts`
- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/schema.ts`

Do not hand-edit generated outputs.

## Best Practices

- model plugins as first-class components, not ad hoc runtime extensions
- keep component packages self-contained and installable through a manifest
- prefer explicit capabilities and bindings over implicit global access
- preserve the distinction between root `api` and installed `components`
- let the current app and generated files define the effective public surface
