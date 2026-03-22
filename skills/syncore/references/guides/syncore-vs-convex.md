# Syncore vs Convex

Syncore intentionally borrows the programming model that makes Convex pleasant:

- backend functions are declared with `query`, `mutation`, and `action`
- clients call typed references from a generated `api` object
- React components use hooks like `useQuery` and `useMutation`
- TypeScript inference flows from schema and function definitions into app code

The main difference is where the runtime lives.

## Convex

- functions run in a hosted backend
- the database is remote
- the client talks to a deployment URL
- `convex dev` connects local source code to that remote environment

Convex is primarily a solution for the "I need a backend" problem:

- shared cloud state across many users and devices
- server-side execution and centralized orchestration
- real-time fanout from a remote source of truth
- backend-managed auth and access control boundaries
- apps that assume the network is a normal part of the happy path
- making multi-user and multi-device synchronization straightforward because
  every client converges on the same remote state

Convex is usually the better fit for:

- collaborative SaaS
- multiplayer or shared-workspace products
- dashboards and internal tools over centralized data
- products where the backend is the center of the architecture

## Syncore

- functions run inside the app or device
- the database is local SQLite or local browser persistence
- the client talks to a local runtime, worker, or IPC bridge
- `syncorejs dev` keeps local codegen, schema state, and migrations in sync

Syncore is primarily a solution for the "I need backend-style structure, but
executed locally" problem:

- local-first data and execution
- strong behavior when offline or on unstable networks
- on-device storage and privacy-sensitive workflows
- one typed runtime model reused across browser, desktop, mobile, and scripts
- app architectures where local persistence is the source of truth
- making local state, local storage, and reactive UI synchronization
  straightforward because they share the same local runtime

Syncore is usually the better fit for:

- offline-first apps
- Electron desktop apps
- installable browser apps that should keep working after first load
- mobile apps with local persistence as a first-class requirement
- personal productivity tools, field apps, and embedded/operator workflows

## Why the DX Needs Different Tooling

Because Syncore is local-first, some platform wiring exists that Convex does
not need:

- web and Next need a worker to keep SQLite work off the main thread
- Electron needs a main-process runtime and a safe renderer bridge
- Expo needs local bootstrap around `expo-sqlite`
- Node scripts need local runtime lifecycle management

Convex does not need that same host wiring because its runtime lives on the
remote service. Syncore does, because runtime ownership belongs to the app host.

## How To Decide

Choose Convex when:

- the main job is synchronizing shared remote state
- your product needs a canonical cloud database
- server-side authority is part of the product model
- you want synchronization across users and devices to be centered on one
  backend with minimal custom sync infrastructure

Choose Syncore when:

- the main job is preserving local execution and local data ownership
- offline behavior is a requirement, not a cache optimization
- the app must run consistently across browser worker, Electron, Expo, or Node
- you want local reads, writes, and UI state to stay synchronized with minimal
  host-specific glue around a local runtime

## Practical Takeaway

If you like Convex because it feels typed, reactive, and hard to misuse,
Syncore should feel familiar. The difference is that data and execution stay
on-device.
