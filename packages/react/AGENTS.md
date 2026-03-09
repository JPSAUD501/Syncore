# React Bindings Guide

## Scope

`packages/react` owns the public React ergonomics for Syncore: provider wiring, query subscriptions, and mutation or action hooks.

## Invariants

- `useQuery`, `useMutation`, and `useAction` must infer args and results directly from `FunctionReference`.
- Hook implementations must dispose watches reliably when references or args change.
- React-facing APIs should stay thin wrappers over the runtime client, not duplicate runtime logic.

## When Editing Hooks

- Validate inference without manual generics in tests.
- Prefer tests that cover watch lifecycle, subscription churn, and result propagation.
- Keep hook signatures aligned with `SyncoreClient`; do not introduce narrower types in React than the core runtime exposes.

## Tests To Run

- `bun run --filter @syncore/react test`
- `bun run --filter @syncore/react typecheck`

## Common Failure Modes

- Ref widening can silently degrade `useQuery(api.foo.bar)` into `{}` or `unknown`.
- Watch cleanup regressions can look harmless in unit tests but leak subscriptions in long-lived views.
