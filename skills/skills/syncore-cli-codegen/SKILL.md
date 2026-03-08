---
name: syncore-cli-codegen
displayName: Syncore CLI And Codegen
description: Syncore CLI workflows for project scaffolding, generated APIs, schema checks, SQL migrations, and the local devtools hub.
version: 1.0.0
author: Syncore
tags: [syncore, cli, codegen, migrations, devtools]
---

# Syncore CLI And Codegen

Use this skill when working on `@syncore/cli`, generated files, or the developer loop inside a Syncore app.

## Documentation Sources

Read these first:

- `packages/cli/src/index.ts`
- `packages/cli/AGENTS.md`
- `README.md`
- `docs/development.md`
- `docs/architecture.md`

## Instructions

### CLI Commands

The current CLI surface includes:

- `npx syncore init`
- `npx syncore codegen`
- `npx syncore doctor`
- `npx syncore migrate:status`
- `npx syncore migrate:generate <name>`
- `npx syncore migrate:apply`
- `npx syncore dev`

### init

`syncore init` scaffolds the standard project layout:

- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/functions/messages.ts`
- `syncore/crons.ts`
- `syncore/migrations/`
- `syncore/_generated/`

### codegen

`syncore codegen` scans `syncore/functions/**/*.ts`, finds exported `query`, `mutation`, and `action` definitions, and generates:

- `syncore/_generated/api`
- `syncore/_generated/functions`
- `syncore/_generated/server`

The generated API must preserve end-to-end types by referencing function definitions through `createFunctionReferenceFor<typeof ...>(...)`.

### dev

`syncore dev` is the main local development loop. It bootstraps codegen and migration work, then runs the devtools hub and watches relevant project inputs.

### Migrations

The CLI compares the current schema against a stored snapshot and renders SQL for safe changes.

Typical flow:

```bash
npx syncore migrate:status
npx syncore migrate:generate add_notes_table
npx syncore migrate:apply
```

### Monorepo Constraint

Inside the Syncore repo, examples intentionally run codegen from CLI source. Avoid changes that require built `dist` output to exist while parallel tasks are running.

## Examples

### Typical App Loop

```bash
npx syncore init
npx syncore codegen
npx syncore doctor
npx syncore migrate:status
npx syncore dev
```

### Generated API Pattern

Codegen should emit references shaped like this:

```ts
import { createFunctionReferenceFor } from "syncore";
import {
  create as tasks__create,
  list as tasks__list
} from "../functions/tasks";

export const api = {
  tasks: {
    list: createFunctionReferenceFor<typeof tasks__list>("query", "tasks/list"),
    create: createFunctionReferenceFor<typeof tasks__create>(
      "mutation",
      "tasks/create"
    )
  }
} as const;
```

## Best Practices

- Treat codegen regressions as high-priority DX issues
- Keep generated files as outputs, never hand-maintained sources
- Preserve `createFunctionReferenceFor<typeof ...>` in generated API files
- Prefer `import type` where generated code only needs type positions
- Verify codegen changes with CLI tests and example integrations
- Keep the dev loop independent from workspace `dist` artifacts when examples are involved

## Common Pitfalls

1. Breaking type flow by emitting looser generated reference types
2. Requiring built CLI output during parallel example validation
3. Fixing generated files manually instead of fixing the template source
4. Treating migration SQL as unreviewed boilerplate

## References

- `packages/cli/src/index.ts`
- `packages/cli/AGENTS.md`
- `README.md`
- `docs/development.md`
