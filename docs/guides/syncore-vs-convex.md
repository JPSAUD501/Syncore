# Syncore vs Convex

Syncore intentionally borrows the programming model that makes Convex pleasant:

- backend functions are declared with `query`, `mutation`, and `action`
- clients call typed references from a generated `api` object
- React components use hooks like `useQuery` and `useMutation`
- TypeScript inference flows from schema and function definitions into app code

The biggest difference is where the runtime lives.

## Convex

- your functions run in a hosted backend
- the database is remote
- the client talks to a deployment URL
- `convex dev` connects local source code to that remote environment

## Syncore

- your functions run inside the app or device
- the database is local SQLite or local browser persistence
- the client talks to a local runtime, worker, or IPC bridge
- `syncorejs dev` keeps local codegen, schema state, and migrations in sync

## Why the DX needs different tooling

Because Syncore is local-first, some platform wiring exists that Convex does not need:

- web and Next need a worker to keep SQLite work off the main thread
- Electron needs a main-process runtime and a safe renderer bridge
- Expo needs local bootstrap around `expo-sqlite`
- Node scripts need local runtime lifecycle management

The DX goal is to hide as much of that as possible behind short-form helpers.

## Current Syncore short forms

- browser react: `SyncoreBrowserProvider`
- next: `SyncoreNextProvider`
- expo: `SyncoreExpoProvider`
- electron renderer: `SyncoreElectronProvider`
- node scripts: `withNodeSyncoreClient`

## Mental model shift

With Convex, the backend already exists and your app connects to it.

With Syncore, your app ships the backend with it.

That means Syncore optimizes for:

- zero-network development and runtime usage
- local persistence and offline behavior
- platform-aware bootstrap helpers
- generated types and IDE docs that make the local runtime feel just as approachable

## Practical takeaway

If you like Convex because it feels typed, reactive, and hard to misuse, Syncore
should feel familiar.

If you need the same feeling but with data and execution fully on-device, Syncore
is trying to be that experience.
