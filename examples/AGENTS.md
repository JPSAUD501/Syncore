# Examples Guide

## Role Of Examples

Examples are both documentation and integration fixtures. They should demonstrate intended DX with as little local boilerplate as possible.

## Expectations

- Favor `useQuery(api.namespace.fn)`, `useMutation(api.namespace.fn)`, and `useAction(api.namespace.fn)` without manual generics where the platform supports it.
- Generated files under `syncore/_generated` are outputs, not hand-maintained sources.
- Example scripts should stay deterministic under Turbo parallelism.

## Validation

- Expo: `bun run --filter syncore-example-expo typecheck`
- Electron: `bun run --filter syncore-example-electron typecheck`
- Next PWA: `bun run --filter syncore-example-next-pwa build`

## Editing Guidance

- Keep examples representative of the current public API.
- If a DX regression forces extra local type annotations in an example, treat that as a platform bug unless there is a clear product limitation.
