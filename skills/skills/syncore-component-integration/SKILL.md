---
name: syncore-component-integration
description: Install and use Syncore components, plugins, or reusable modules in an app through `syncore/components.ts`, generated `components` APIs, capability grants, bindings, and component-aware CLI or runtime workflows.
---

# Syncore Component Integration

Use this skill when wiring a component into a Syncore app. This includes
installing a package, configuring `syncore/components.ts`, granting
capabilities, defining bindings, consuming generated component refs, and
debugging component-aware CLI behavior.

## Documentation Sources

Read these first from the current app:

- `package.json`
- `syncore.config.ts`
- `syncore/components.ts`
- `syncore/schema.ts`
- `syncore/_generated/components.ts`
- `syncore/_generated/api.ts`
- app bootstrap files
- installed `syncorejs` docs or type declarations

## Instructions

### Default Integration Workflow

When installing a component into an app, work in this order:

1. Import the component package into `syncore/components.ts`
2. Choose a stable alias
3. Provide config
4. Grant the minimum capabilities needed
5. Add bindings for declared dependencies
6. Run `npx syncorejs codegen`
7. Consume the generated `components.<alias>.*` refs in app code
8. Verify bootstrap passes `resolvedComponents` to the runtime

### Canonical Install Point

Installed components belong in `syncore/components.ts`.

That file should default export `defineComponents({...})`.

Typical install shape:

```ts
import { defineComponents, installComponent } from "syncorejs/components";
import { cacheComponent } from "@acme/syncore-cache";

export default defineComponents({
  cache: installComponent({
    component: cacheComponent,
    source: "@acme/syncore-cache",
    config: {
      maxEntries: 5000
    },
    capabilities: ["ownTables", "storage", "publicExports"]
  })
});
```

### What The App Host Owns

The app host decides:

- install alias
- config values
- capability grants
- bindings
- child installs

If the component package asks for more than the app should allow, reduce the
granted capabilities at installation time instead of weakening app boundaries.

### Bindings Connect Components

Bindings map a dependency name declared by the component to an installed alias
or component path in the app manifest.

```ts
bindings: {
  clock: "clock"
}
```

If a component declares a dependency and the binding is missing, bootstrap or
codegen should fail clearly.

### Generated Surfaces

After `npx syncorejs codegen` or `npx syncorejs dev`, the app should get:

- `syncore/_generated/schema.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/components.ts`
- `syncore/_generated/api.ts`

`syncore/_generated/api.ts` re-exports `components`, so app code can use:

```ts
import { api, components } from "../syncore/_generated/api";
```

Use:

- `api.*` for root app functions
- `components.<alias>.*` for installed component public functions

### Runtime Bootstrapping

Platform bootstraps should load `resolvedComponents` from
`syncore/_generated/components` and pass them to the runtime or adapter.

If component functions exist in generated files but fail at runtime, check
bootstrap wiring before changing the component package.

### CLI Expectations

Use the CLI to validate the integration:

- `npx syncorejs doctor`
- `npx syncorejs codegen`
- `npx syncorejs migrate:status`
- `npx syncorejs migrate:generate`
- `npx syncorejs migrate:apply`

## Best Practices

- Keep all installs in `syncore/components.ts`
- Give each installed component a stable alias
- Grant the minimum capabilities needed for that installation
- Wire dependencies through bindings instead of direct cross-component imports
- Consume component public APIs through generated `components.<alias>.*` refs
- Treat missing generated component refs as a codegen or manifest problem first

## Common Pitfalls

1. Installing a component but forgetting to rerun codegen
2. Calling component internals from app code instead of using public exports
3. Missing capability grants for `storage` or `scheduler`
4. Missing bindings for declared dependencies
5. Patching generated files instead of fixing the manifest or package export

## References

- `package.json`
- `syncore/components.ts`
- `syncore/_generated/components.ts`
- `syncore/_generated/api.ts`
- app bootstrap files
