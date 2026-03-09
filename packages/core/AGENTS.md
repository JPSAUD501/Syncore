# Core Runtime Guide

## Scope

`packages/core` owns the canonical runtime contract: function definitions, function references, client APIs, scheduler behavior, storage coordination, and devtools emission.

## Invariants

- `FunctionReference` must preserve `kind`, `args`, and `result` through phantom types.
- Runtime client methods must not erase typed args/results at adapter boundaries.
- Optional args ergonomics are intentional for empty-object validators. Changes here ripple into React hooks and generated APIs.
- Schema drift should fail fast when destructive changes are detected.

## When Changing Types

- Revalidate `packages/core/src/runtime/functions.ts`, `packages/core/src/runtime/runtime.ts`, CLI codegen, React hooks, and adapter bridges together.
- Prefer structural extractor types over nominal constraints when contravariance would erase handler context information.
- Add tests that protect inference, not only runtime behavior.

## Tests To Run

- `bun run --filter syncore test`
- `bun run --filter syncore typecheck`

## Common Failure Modes

- Widening `FunctionReference` constraints to `JsonObject` or broad unions can break example inference.
- Reintroducing `{}`-based optional arg detection can conflict with strict lint rules and produce unstable call signatures.
