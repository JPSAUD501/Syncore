# Syncore Best Practices

## Default Working Sequence

Use this sequence unless the task is clearly narrower:

1. inspect `package.json` and `syncore.config.ts`
2. read `syncore/schema.ts`, `syncore/components.ts`, and relevant `syncore/functions/**/*.ts`
3. inspect `syncore/_generated/api.ts` to confirm the app-visible API
4. if generated files look stale, run `npx syncorejs codegen` or `npx syncorejs dev`
5. change source files only, not `syncore/_generated/*`
6. rerun codegen and the relevant validations

## Project Shape

```text
syncore/
  schema.ts
  components.ts
  functions/
    tasks.ts
  migrations/
  _generated/
syncore.config.ts
```

## Generated Files Are Outputs

Treat these as generated artifacts:

- `syncore/_generated/api.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/server.ts`
- `syncore/_generated/schema.ts`
- `syncore/_generated/components.ts`

Do not hand-edit them.

## Prefer Public Entry Points in App Code

Use public `syncorejs/*` entrypoints in app code and docs whenever possible.

## App Code vs Reusable Components

Use app code for app-specific schema, functions, install decisions, and
platform bootstrap. Use reusable component packages for portable schema,
functions, and capabilities designed for reuse.

## Common Pitfalls

1. editing generated files directly instead of fixing source inputs
2. solving type regressions with app-level casts instead of checking generated outputs
3. mixing app-specific code and reusable component code without a clear boundary
4. importing internal implementation paths instead of `syncorejs/*`
5. assuming hosted-backend patterns apply unchanged to Syncore
