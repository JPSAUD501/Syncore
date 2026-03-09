# Schema Package Guide

## Scope

`packages/schema` defines validators, schema metadata, and migration planning primitives used by the runtime and codegen.

## Invariants

- Validator inference must remain stable across scalar validators, object validators, arrays, unions, and nested objects.
- Table definitions are the source of truth for document shape and input shape.
- Migration planning should stay conservative: destructive drift must be explicit and easy to detect.

## When Editing Schema Types

- Check both type inference and runtime validation behavior.
- Revalidate consumers in `packages/core` and CLI codegen if you touch exported validator types.
- Prefer small, composable validator utilities over broad helper abstractions that hide shape information.

## Tests To Run

- `bun run --filter @syncore/schema lint`
- `bun run --filter @syncore/schema typecheck`
- `bun run --filter syncore test`

## Common Failure Modes

- Relaxing validator types too much can erase return or arg inference in generated APIs.
- Schema planner changes can look isolated but break migration safety in runtime startup flows.
