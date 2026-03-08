# Web Adapter Guide

## Scope

`packages/platform-web` provides browser runtimes, persistence adapters, SQL.js integration, OPFS and IndexedDB storage, and the worker bridge.

## Invariants

- Worker transport should preserve typed references without leaking transport-only constraints into the public API.
- Browser persistence adapters should remain swappable without changing runtime semantics.
- SQL.js bootstrap and file location wiring must stay deterministic for tests and examples.

## Testing Priorities

- Query or mutation behavior through the runtime with realistic browser persistence.
- Worker bridge success and failure propagation, including watch updates.
- Type declarations published by the built package, especially for worker client methods.

## Tests To Run

- `pnpm --filter @syncore/platform-web test`
- `pnpm --filter @syncore/platform-web typecheck`
- `pnpm --filter syncore-example-next-pwa build`

## Common Failure Modes

- Type-only helper changes in the worker client can degrade hook inference downstream.
- Browser tests can pass locally while declaration output drifts, so validate both runtime tests and package builds.
