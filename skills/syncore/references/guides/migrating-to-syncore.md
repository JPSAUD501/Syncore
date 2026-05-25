# Migrating to Syncore

Use this guide when adding Syncore to an existing project, or when migrating
from another data layer such as Convex, Redux, Zustand, React Query, or a
custom local-storage solution.

## Decision First

Read [syncore-vs-convex.md](syncore-vs-convex.md) before migrating. Choose
Syncore when:

- the app must work fully offline after first load
- data should stay on-device, not travel through a remote backend
- the target hosts are Electron, Expo, a browser-installed app, or a Node script
- local execution and local persistence are product requirements, not optimizations

If those conditions apply, proceed below.

## Step 1 — Install `syncorejs`

```bash
npm install syncorejs
```

For browser, Svelte, and Next apps, keep the install command to `syncorejs` plus
the app framework packages.

For Expo apps:

```bash
npm install expo-sqlite expo-file-system
```

## Step 2 — Scaffold the Syncore project

Use `syncorejs init` to create the Syncore directory structure. The CLI detects
your project type automatically, or you can pass a template explicitly:

```bash
# Auto-detect (prompts when ambiguous)
npx syncorejs init

# Explicit template
npx syncorejs init --template react-web   # Vite/React web
npx syncorejs init --template svelte      # Svelte / SvelteKit
npx syncorejs init --template next        # Next.js
npx syncorejs init --template expo        # Expo
npx syncorejs init --template electron    # Electron
npx syncorejs init --template node        # Node scripts
npx syncorejs init --template minimal     # any other host
```

After `init`, your project will contain:

```text
syncore/
  schema.ts          ← define your tables here
  components.ts      ← install reusable components (optional)
  functions/         ← write queries, mutations, and actions here
  migrations/        ← generated SQL migrations
  _generated/        ← generated outputs — do not hand-edit
syncore.config.ts    ← Syncore project config
```

## Step 3 — Model your data as a Syncore schema

Open `syncore/schema.ts` and replace the scaffolded schema with your app's
real data model. Map your existing entities to `defineTable({ ... })` entries:

```ts
import { defineSchema, defineTable, s } from "syncorejs";

export default defineSchema({
  // Map each existing data entity to a Syncore table.
  // Use s.string(), s.number(), s.boolean(), s.id(), s.enum(), etc.
  // See references/schema-migrations.md for the full builder guide.
  tasks: defineTable({
    title: s.string(),
    status: s.enum(["todo", "doing", "done"] as const),
    projectId: s.nullable(s.id("projects"))
  })
    .index("by_status", ["status"])
    .index("by_project_status", ["projectId", "status"])
});
```

Rules for a clean schema migration:
- Start from the real document shape, not from ad hoc validation snippets.
- Use `s.optional(...)` for fields that may be absent; `s.nullable(...)` for fields that exist conceptually but may be `null`.
- Use `s.id("table")` for foreign keys instead of plain strings.
- Use `s.enum([...])` for closed status sets.
- Add indexes only for access patterns you actually have.

## Step 4 — Write your functions

Open (or create) files inside `syncore/functions/`. Translate your existing
data-access logic to typed `query`, `mutation`, and `action` functions:

```ts
import { mutation, query, s } from "../_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => ctx.db.query("tasks").collect()
});

export const create = mutation({
  args: { title: s.string() },
  handler: async (ctx, args) =>
    ctx.db.insert("tasks", { title: args.title, status: "todo", projectId: null })
});
```

## Step 5 — Run codegen

```bash
npx syncorejs dev
```

Or, for a one-off pass without the dev loop:

```bash
npx syncorejs codegen
```

This generates `syncore/_generated/api.ts`, `_generated/functions.ts`,
`_generated/server.ts`, and `_generated/schema.ts`. Import from these generated
outputs, not from source files directly.

## Step 6 — Wire the platform adapter

Replace any existing data-fetching bootstrap with the Syncore platform adapter
for your host. See the matching quickstart for the full bootstrap code:

- React web → `syncorejs/browser` + browser worker
- Next → `syncorejs/next/config` + `SyncoreNextProvider`
- Expo → `syncorejs/expo` + `SyncoreExpoProvider`
- Electron → `syncorejs/node` + `bindElectronWindowToSyncoreRuntime`
- Node script → `syncorejs/node` + `withNodeSyncoreClient`
- Svelte → `syncorejs/svelte` + browser worker

## Step 7 — Replace UI data bindings

### Migrating from Convex

The function and hook API is intentionally similar. The main surface changes:

| Convex | Syncore |
| --- | --- |
| `import { api } from "../convex/_generated/api"` | `import { api } from "../syncore/_generated/api"` |
| `import { v } from "convex/values"` | `import { s } from "syncorejs"` (use `s.*` builders) |
| `ConvexProvider` | Platform provider (`SyncoreBrowserProvider`, `SyncoreExpoProvider`, etc.) |
| `useQuery(api.tasks.list)` | `useQuery(api.tasks.list)` ← same signature |
| `useMutation(api.tasks.create)` | `useMutation(api.tasks.create)` ← same signature |
| `useAction(api.tasks.export)` | `useAction(api.tasks.export)` ← same signature |
| `useConvexAuth()` | no direct equivalent — Syncore is local-first, not auth-gated |
| `ctx.runQuery(...)` inside actions | `ctx.runQuery(...)` ← same |
| `ctx.runMutation(...)` inside actions | `ctx.runMutation(...)` ← same |

Remove Convex-specific features that have no local-first equivalent:
- `ConvexReactClient` with a deployment URL
- `useConvexAuth` and auth-gated function behavior
- server-triggered actions that depend on remote connectivity

Replace multi-user sync expectations with local-first reactivity. Syncore
queries are reactive within the same local runtime. Cross-device sync is an app
concern, not a built-in guarantee.

### Migrating from Redux / Zustand / Jotai

Replace:
- selectors and `useSelector` with `useQuery(api.table.list)`
- dispatch calls with `useMutation(api.table.create)`
- thunks and sagas with `useAction(api.table.runSideEffect)`
- store slices with Syncore tables in `syncore/schema.ts`
- async side effects with `action` functions in `syncore/functions/`

The Syncore query subscription replaces manual cache invalidation: any
`mutation` that writes to a table automatically invalidates any `query` that
reads from it.

### Migrating from React Query / SWR

Replace:
- `useQuery({ queryKey, queryFn })` with `useQuery(api.table.list)`
- `useMutation(...)` with `useMutation(api.table.create)`
- manual cache invalidation with automatic Syncore invalidation after mutations
- server fetch functions with Syncore `query` and `mutation` functions

Syncore queries do not need a `queryKey`. The generated typed reference
(`api.table.list`) is the key.

### Migrating from localStorage / IndexedDB / SQLite directly

Replace:
- `localStorage.setItem(...)` and `getItem(...)` with a Syncore `mutation` and `query`
- raw IndexedDB transactions with Syncore mutations (which are transactional)
- manual schema migrations with `npx syncorejs migrate generate` and `apply`
- untyped JSON blobs with explicit `defineTable(...)` schemas
- hand-rolled reactivity with `useQuery` subscriptions

## Step 8 — Run migrations (if existing data)

If the app already has local data in a previous storage format, write a Syncore
migration to move it into the new schema:

```bash
npx syncorejs migrate status
npx syncorejs migrate generate add_tasks_table
npx syncorejs migrate apply
```

Review the generated SQL in `syncore/migrations/*.sql` before applying.

## Step 9 — Validate

Run the CLI health check:

```bash
npx syncorejs doctor
npx syncorejs targets
```

Verify the app boots, queries run, and mutations persist. Check that
`useSyncoreStatus()` reaches `ready` instead of stalling at `booting`.

## Step 10 — Clean up

Remove the old data layer once Syncore functions cover all previous data paths:
- uninstall the old library
- remove old schema definitions, selectors, slices, or query functions
- remove unused environment variables or remote URL config

## Common Pitfalls During Migration

1. Importing from `syncorejs` internal paths instead of `syncorejs/*` public entrypoints.
2. Editing `syncore/_generated/*` files manually — they are generated outputs.
3. Expecting cross-device sync by default — Syncore is local-first; multi-device
   sync is an app concern.
4. Skipping the platform adapter wiring and calling functions directly without a
   provider — hooks require a provider.
5. Keeping the Convex deployment URL in config — Syncore does not use a remote URL.
6. Forgetting to pass `resolvedComponents` to the runtime when components are installed.
7. Not running `npx syncorejs codegen` after changing `syncore/schema.ts` or
   function signatures.
