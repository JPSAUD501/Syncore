---
name: syncore
description: Unified Syncore skill for local-first backend, offline runtime, schema, migrations, generated APIs, React hooks, CLI workflows, platform adapters, scheduler, storage, and project quickstarts. Use when building, debugging, documenting, or reviewing any Syncore app, package, runtime integration, or developer workflow.
---

# Syncore

Use this skill as the single entrypoint for Syncore work. Keep reasoning
retrieval-led: inspect the current app, generated outputs, and installed
`syncorejs` surface before relying on assumptions.

## Start Here

Inspect these project-local sources first:

- `package.json`
- `tsconfig.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/functions/**/*.ts`
- `syncore/migrations/*`
- `syncore/_generated/*`
- app bootstrap files such as `main.ts`, `syncore.worker.ts`, `lib/syncore.ts`, provider wrappers, or Electron preload files

Stable reasoning rules:

- Treat Syncore as a local-first runtime, not a hosted backend.
- Treat `syncore/_generated/*` as outputs, not hand-maintained source files.
- Prefer public `syncorejs/*` entrypoints in app code and docs.
- Use `s.*` as the only schema-builder surface.
- Prefer a data-model-first approach over validator-first helpers.
- Model document shape, field paths, indexes, search indexes, and codecs explicitly.
- Validate monorepo-wide when DX, codegen, exported types, or adapters change.
- Fix regressions at the type source instead of papering over them in examples.

## Schema Authoring Rules

When the task touches `syncore/schema.ts`, default to this model:

- Start from the document shape, not from ad hoc validation snippets.
- Use `defineSchema({ ... })` at the root and one `defineTable({ ... })` per table.
- Prefer explicit domain fields over catch-all blobs.
- Add indexes only for real query patterns.
- Every `withIndex(...)` or `withSearchIndex(...)` should correspond to a schema definition.
- Use `s.id("table")` for foreign keys instead of plain strings.
- Use `s.enum([...])` for closed state machines and finite status sets.
- Use `s.optional(...)` when a field may be omitted entirely.
- Use `s.nullable(...)` when the field exists conceptually but may be `null`.
- Use `s.union(...)` for true variant payloads.
- Use `s.record(...)` only for dynamic keyed maps.
- Use `s.codec(...)` when app shape and stored shape differ.
- Treat `s.any()` as a last resort.

Recommended `syncore/schema.ts` shape:

```ts
import { defineSchema, defineTable, s } from "syncorejs";

const isoDate = s.codec(s.string(), {
  storage: s.number(),
  serialize: (value) => Date.parse(value),
  deserialize: (value) => new Date(value).toISOString()
});

export default defineSchema({
  projects: defineTable({
    name: s.string(),
    slug: s.string(),
    color: s.string(),
    archivedAt: s.optional(s.number())
  }).index("by_slug", ["slug"]),

  tasks: defineTable({
    title: s.string(),
    status: s.enum(["todo", "doing", "done"] as const),
    projectId: s.nullable(s.id("projects")),
    dueAt: s.optional(isoDate),
    metadata: s.record(s.string(), s.string()),
    payload: s.union(
      s.object({
        kind: s.literal("note"),
        body: s.string()
      }),
      s.object({
        kind: s.literal("checklist"),
        items: s.array(
          s.object({
            text: s.string(),
            done: s.boolean()
          })
        )
      })
    )
  })
    .index("by_status", ["status"])
    .index("by_project_status", ["projectId", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "projectId"]
    })
});
```

Schema review checklist:

- Does each field express the real application shape?
- Are optional and nullable semantics modeled distinctly?
- Are ids table-aware?
- Do index names describe the access pattern?
- Do indexed fields match actual query usage?
- Is search backed by a dedicated search field when needed?
- Is any codec explicit about storage type and round-trip behavior?
- Is `s.any()` avoidable?

## Dev Script Recommendation

For Syncore app projects, recommend Turborepo in TUI mode as the default dev
orchestration pattern so the app process and `syncorejs dev` stay up together.
Use the examples as the baseline:

- Root `turbo.json` should keep `"ui": "tui"` so developers can manage the
  long-running app and Syncore processes in one terminal flow.
- App `package.json` should expose:
  - `dev`: `turbo run dev:app --filter=<package-name>`
  - `dev:app`: the host app's actual dev command such as `vite`, `next dev`,
    `expo start`, or the Electron entry
  - `dev:syncore`: `bun run syncorejs:dev` or the equivalent local CLI entry
- App-local `turbo.json` should make `dev:app` run with `dev:syncore`:

```json
{
  "extends": ["//"],
  "tasks": {
    "build:deps": {
      "cache": false
    },
    "dev:app": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["build:deps"],
      "with": ["dev:syncore"]
    },
    "dev:syncore": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["build:deps"]
    }
  }
}
```

Why this is the default recommendation:

- `syncorejs dev` starts the local devtools hub and dashboard alongside the app
- the TUI makes both long-running processes visible and restartable in one
  place
- this mirrors the real examples under `examples/browser-esm`,
  `examples/electron`, `examples/expo`, `examples/next-pwa`, and
  `examples/sveltekit`

Do not recommend ad-hoc parallel shell commands first when the project already
uses Turborepo. Prefer the `dev`/`dev:app`/`dev:syncore` split above so the app
and dashboard come up together in a repeatable workspace-native flow.

## Syncore vs Convex

Syncore and Convex can feel similar at the API layer, but they are solving
different product and infrastructure problems.

Shared developer experience:

- typed `query`, `mutation`, and `action` functions
- generated refs and typed client calls
- reactive UI bindings
- schema-led TypeScript flow

Primary difference:

- Convex is a hosted backend platform for apps whose source of truth should
  live on a remote service.
- Syncore is a local-first runtime for apps whose source of truth should stay
  on the device, browser, desktop process, or local environment.

Problems Convex primarily solves:

- building a backend quickly without provisioning your own API and database
- keeping many users and devices synced through a shared cloud source of truth
- centralizing auth, access control, and server-side orchestration
- reacting to writes in real time across connected clients
- shipping web products where online connectivity is expected most of the time
- making cross-user and cross-device state synchronization feel simple because
  the backend is the canonical state authority

Problems Syncore primarily solves:

- running backend logic locally with the same typed function model
- preserving app behavior when offline, on flaky networks, or without any
  backend connection
- keeping private or workspace-local data on-device
- using SQLite or browser persistence as the primary datastore
- sharing one application model across web workers, Electron main process,
  Expo, Svelte, React, and Node scripts
- making local state and local data synchronization feel simple inside the app
  because the runtime, storage, and reactive reads live together on-device

Recommended applications for Convex:

- collaborative SaaS products
- shared workspaces with a canonical cloud dataset
- admin panels and internal tools that depend on server-side access to shared
  resources
- apps where backend-triggered workflows, auth boundaries, and centralized
  data governance matter more than offline-first execution
- products where the easiest path is "every client syncs through the same
  backend"

Recommended applications for Syncore:

- personal productivity apps, local tools, and offline-capable mobile apps
- desktop software built with Electron
- browser apps that should continue working fully offline after install
- apps with per-user local state, embedded runtimes, or edge-device workflows
- developer tools and automations that benefit from a typed local runtime
- products where the easiest path is "keep local state, local persistence, and
  UI reactivity in sync without depending on a remote backend"

Decision heuristic:

- choose Convex when the main problem is "we need a shared cloud backend"
- choose Syncore when the main problem is "the app must keep working locally"
- choose Syncore especially when local execution, local persistence, and
  platform-native wiring are product requirements rather than optimizations

## Documentation Standards

When writing or updating Syncore docs and skills:

- Every supported host must have at least one code example:
  - React web
  - Next PWA
  - Expo
  - Electron
  - Svelte
  - Node scripts
- Examples must be faithful to the current public API. Do not invent helper
  names, props, or runtime options.
- Prefer imports from generated outputs in app docs:
  - `syncore/_generated/schema`
  - `syncore/_generated/functions`
  - `syncore/_generated/components` when components are installed
- Each host example should show the real bootstrap point plus one realistic
  consumption path such as a query, mutation, or runtime-status read.
- Before changing snippets, cross-check the nearest package source and the
  matching app under `examples/`.

Current example apps to use as reality anchors:

- React web: `examples/browser-esm`
- Next PWA: `examples/next-pwa`
- Expo: `examples/expo`
- Electron: `examples/electron`
- Svelte: `examples/sveltekit`

## Reference Routing

Pick the narrowest reference set that matches the task:

- Architecture and runtime model: [references/architecture.md](references/architecture.md)
- Contributor workflow and workspace validation: [references/development.md](references/development.md)
- DX guardrails and project structure: [references/best-practices.md](references/best-practices.md)
- Queries, mutations, actions, schema builders, and typed refs: [references/functions.md](references/functions.md)
- Schema evolution and SQL migrations: [references/schema-migrations.md](references/schema-migrations.md)
- React providers and hooks: [references/react-realtime.md](references/react-realtime.md)
- CLI surface, codegen, and product contract: [references/cli-codegen.md](references/cli-codegen.md)
- Runtime wiring across platforms: [references/platform-adapters.md](references/platform-adapters.md)
- Scheduling and file storage: [references/scheduler-storage.md](references/scheduler-storage.md)
- Component model, authoring, and installation:
  - [references/components.md](references/components.md)
  - [references/component-authoring.md](references/component-authoring.md)
  - [references/component-integration.md](references/component-integration.md)
- Quickstarts by app host:
  - [references/quickstarts/react-web.md](references/quickstarts/react-web.md)
  - [references/quickstarts/next-pwa.md](references/quickstarts/next-pwa.md)
  - [references/quickstarts/expo.md](references/quickstarts/expo.md)
  - [references/quickstarts/electron.md](references/quickstarts/electron.md)
  - [references/quickstarts/svelte.md](references/quickstarts/svelte.md)
  - [references/quickstarts/node-script.md](references/quickstarts/node-script.md)
- Conceptual guides:
  - [references/guides/syncore-vs-convex.md](references/guides/syncore-vs-convex.md)
  - [references/guides/cli-product-contract.md](references/guides/cli-product-contract.md)
- Maintainer policy: [references/project/open-source-guidelines.md](references/project/open-source-guidelines.md)

## Recommended Reading Order

Choose an order based on the task:

1. Broad Syncore change:
   `architecture` -> `development` -> `best-practices` -> narrow domain reference
2. Backend logic:
   `best-practices` -> `functions` -> `schema-migrations` when data shape changes
3. React or Svelte UI and app wiring:
   `best-practices` -> relevant quickstart -> `react-realtime` -> `platform-adapters`
4. CLI or generated output:
   `development` -> `cli-codegen` -> `guides/cli-product-contract`
5. Scheduler or storage feature:
   `architecture` -> `functions` -> `scheduler-storage`
6. Reusable component or plugin feature:
   `best-practices` -> `components` -> `component-authoring` or `component-integration`

## Quick Decisions

- Need the runtime mental model or system tables: read `references/architecture.md`
- Need to explain which product problems Syncore solves versus Convex: read `references/guides/syncore-vs-convex.md`
- Need the monorepo workflow or release rules: read `references/development.md`
- Need file layout, source-of-truth rules, or generated-file guardrails: read `references/best-practices.md`
- Need function authoring patterns or schema-builder guidance: read `references/functions.md`
- Need migration sequencing or drift safety: read `references/schema-migrations.md`
- Need help designing `syncore/schema.ts` or choosing between `s.*` builders: read `references/schema-migrations.md` first, then `references/functions.md`
- Need React loading-state or `skip` semantics: read `references/react-realtime.md`
- Need Svelte stores or browser-worker wiring: read `references/quickstarts/svelte.md` and `references/platform-adapters.md`
- Need `syncorejs dev`, `codegen`, `doctor`, `targets`, or migration command behavior: read `references/cli-codegen.md`
- Need Node, browser worker, Expo, Next, or Electron wiring: read `references/platform-adapters.md` and the matching quickstart
- Need recurring jobs, misfire policy, or storage metadata behavior: read `references/scheduler-storage.md`
- Need reusable components, plugins, or `syncore/components.ts`: read `references/components.md`
- Need to build a reusable package: read `references/component-authoring.md`
- Need to install or wire a component into an app: read `references/component-integration.md`
