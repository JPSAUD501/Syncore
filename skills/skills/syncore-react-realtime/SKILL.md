---
name: syncore-react-realtime
displayName: Syncore React Realtime
description: React patterns for Syncore including SyncoreProvider, useQuery, useMutation, useAction, useQueries, loading state handling, and inference-safe hook usage.
version: 1.0.0
author: Syncore
tags: [syncore, react, realtime, hooks, inference]
---

# Syncore React Realtime

Use this skill when wiring Syncore into React apps or debugging hook inference, watch lifecycle, or result propagation.

## Documentation Sources

Read these first:

- `packages/react/src/index.tsx`
- `packages/react/AGENTS.md`
- `docs/quickstarts/react-web.md`
- `docs/quickstarts/expo.md`
- `docs/quickstarts/electron.md`
- `docs/quickstarts/next-pwa.md`
- `examples/electron/src/renderer/App.tsx`
- `examples/expo/App.tsx`
- `examples/next-pwa/app/todos-screen.tsx`

## Instructions

### Provider First

Every hook depends on `SyncoreProvider`:

```tsx
import { SyncoreProvider } from "@syncore/react";

<SyncoreProvider client={client}>{children}</SyncoreProvider>;
```

If the provider is missing, hooks will throw.

### useQuery

`useQuery` is the core reactive read API. It returns `undefined` while the first result is still loading.

```tsx
import { useQuery } from "@syncore/react";
import { api } from "../syncore/_generated/api";

function Tasks() {
  const tasks = useQuery(api.tasks.list) ?? [];
  return <pre>{JSON.stringify(tasks, null, 2)}</pre>;
}
```

### useMutation And useAction

Mutations and actions return callable functions with typed args and results inferred from the reference.

```tsx
import { useAction, useMutation } from "@syncore/react";
import { api } from "../syncore/_generated/api";

const createTask = useMutation(api.tasks.create);
const exportTasks = useAction(api.tasks.exportTasks);
```

### Prefer Inference Over Manual Generics

Preferred:

```tsx
const todos = useQuery(api.todos.list) ?? [];
const createTodo = useMutation(api.todos.create);
```

Fallbacks with manual generics should be treated as a signal to inspect shared typing, not as the ideal pattern.

### Watch Lifecycle Matters

Syncore React hooks are thin wrappers over `SyncoreClient.watchQuery(...)`. When changing React bindings:

- preserve stable args behavior
- dispose watches when refs or args change
- keep React types aligned with `SyncoreClient`

### useQueries

Use `useQueries` when a keyed batch of query subscriptions is the right shape for the view:

```tsx
const data = useQueries([
  { key: "tasks", reference: api.tasks.list },
  { key: "notes", reference: api.notes.list }
]);
```

Represent the result as keyed query state, not as a substitute for ordinary component composition.

## Examples

### Basic App Wiring

```tsx
import { SyncoreProvider, useMutation, useQuery } from "@syncore/react";
import type { SyncoreClient } from "syncore";
import { api } from "../syncore/_generated/api";

export function App({ client }: { client: SyncoreClient }) {
  return (
    <SyncoreProvider client={client}>
      <Todos />
    </SyncoreProvider>
  );
}

function Todos() {
  const todos = useQuery(api.todos.list) ?? [];
  const createTodo = useMutation(api.todos.create);

  return (
    <div>
      <button onClick={() => void createTodo({ title: "Ship local-first DX" })}>
        Add
      </button>
      {todos.map((todo) => (
        <div key={todo._id}>{todo.title}</div>
      ))}
    </div>
  );
}
```

### Loading State

```tsx
function Notes() {
  const notes = useQuery(api.notes.list);
  if (notes === undefined) {
    return <div>Loading...</div>;
  }
  return <pre>{JSON.stringify(notes, null, 2)}</pre>;
}
```

## Best Practices

- Always mount hooks under `SyncoreProvider`
- Prefer `useQuery(api.foo.bar)` without manual generics when typing supports it
- Handle `undefined` loading state explicitly
- Keep hooks thin over `SyncoreClient` rather than duplicating runtime behavior
- When editing hook types, validate inference and watch cleanup together

## Common Pitfalls

1. Calling hooks outside `SyncoreProvider`
2. Treating manual generics as the desired steady state for app code
3. Forgetting that query subscriptions must be cleaned up when args or refs change
4. Narrowing React-facing types more than the core client allows

## References

- `packages/react/src/index.tsx`
- `packages/react/AGENTS.md`
- `docs/quickstarts/react-web.md`
- `examples/next-pwa/app/todos-screen.tsx`
