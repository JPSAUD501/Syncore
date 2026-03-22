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

## Syncore

- functions run inside the app or device
- the database is local SQLite or local browser persistence
- the client talks to a local runtime, worker, or IPC bridge
- `syncorejs dev` keeps local codegen, schema state, and migrations in sync

## Why the DX Needs Different Tooling

Because Syncore is local-first, some platform wiring exists that Convex does
not need:

- web and Next need a worker to keep SQLite work off the main thread
- Electron needs a main-process runtime and a safe renderer bridge
- Expo needs local bootstrap around `expo-sqlite`
- Node scripts need local runtime lifecycle management

## Practical Takeaway

If you like Convex because it feels typed, reactive, and hard to misuse,
Syncore should feel familiar. The difference is that data and execution stay
on-device.
