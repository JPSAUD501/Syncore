# Syncore Skills

Prefer the unified [syncore skill](syncore/SKILL.md) for all core Syncore work.

Use it when the task touches:

- local-first runtime behavior
- schema, migrations, and generated files
- React hooks and providers
- CLI workflows and product UX
- platform adapters
- scheduler and storage
- quickstarts or project policy

Core source-of-truth reminder:

```text
[Syncore App Context]|project-local
|config:{package.json,tsconfig.json,syncore.config.ts}
|source:{syncore/schema.ts,syncore/components.ts,syncore/functions/**/*.ts}
|generated:{syncore/_generated/api.ts,syncore/_generated/functions.ts,syncore/_generated/server.ts,syncore/_generated/schema.ts,syncore/_generated/components.ts}
|runtime:{app bootstrap files,providers,workers,main process entrypoints}
|dependency:{installed syncorejs docs and type declarations}
```

Rules:

- treat the app and installed `syncorejs` version as the source of truth
- do not edit `syncore/_generated/*` directly
- prefer `syncorejs/*` public entrypoints
- load detailed material from `syncore/references/*` only as needed
