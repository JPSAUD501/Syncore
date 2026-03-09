# Node Adapter Guide

## Scope

`packages/platform-node` provides the Node runtime adapter, SQLite storage driver, file storage adapter, devtools bridge, and Electron IPC transport.

## Invariants

- Public adapter types must preserve the same `FunctionReference` inference as core and React.
- IPC transport only needs `kind`, `name`, and serialized args or results; do not overconstrain transport message types.
- Build output must publish both the main entry and `./ipc` declarations correctly.

## Testing Priorities

- Happy-path query, mutation, and watch flows through the runtime and IPC bridge.
- Error propagation from runtime failures to renderer invocations and reactive watchers.
- Packaging checks that verify the built declarations match source signatures.

## Tests To Run

- `bun run --filter @syncore/platform-node test`
- `bun run --filter @syncore/platform-node typecheck`
- `bun run --filter syncore-example-electron typecheck`

## Common Failure Modes

- Narrowing bridge signatures to `JsonObject`-only references can break DX in consumers.
- Cleaning shared `dist` outputs during example validation can create false module-resolution failures.
