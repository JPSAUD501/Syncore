# Syncore Component Integration

Use this guidance when wiring a component into a Syncore app.

## Default Integration Workflow

1. import the component package into `syncore/components.ts`
2. choose a stable alias
3. provide config
4. grant the minimum capabilities needed
5. add bindings for declared dependencies
6. run `npx syncorejs codegen`
7. consume the generated `components.<alias>.*` refs in app code
8. verify bootstrap passes `resolvedComponents` to the runtime

## Canonical Install Point

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

## What the App Host Owns

The app host decides:

- install alias
- config values
- capability grants
- bindings
- child installs

If the component package asks for more than the app should allow, reduce the
granted capabilities at installation time.

## Bindings Connect Components

Bindings map a dependency name declared by the component to an installed alias
or component path in the app manifest.

```ts
bindings: {
  clock: "clock"
}
```

If a component declares a dependency and the binding is missing, bootstrap or
codegen should fail clearly.

## Generated Surfaces

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

## Runtime Bootstrapping

Platform bootstraps should load `resolvedComponents` from
`syncore/_generated/components` and pass them to the runtime or adapter.

If component functions exist in generated files but fail at runtime, check
bootstrap wiring before changing the component package.

## CLI Expectations

Use the CLI to validate the integration:

- `npx syncorejs doctor`
- `npx syncorejs codegen`
- `npx syncorejs migrate:status`
- `npx syncorejs migrate:generate`
- `npx syncorejs migrate:apply`

## Common Pitfalls

1. installing a component but forgetting to rerun codegen
2. calling component internals from app code instead of using public exports
3. missing capability grants for `storage` or `scheduler`
4. missing bindings for declared dependencies
5. patching generated files instead of fixing the manifest or package export
