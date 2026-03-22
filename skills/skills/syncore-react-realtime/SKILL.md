---
name: syncore-react-realtime
description: React patterns for Syncore including `SyncoreProvider`, platform wrapper providers, `useQuery`, `useMutation`, `useAction`, `useQueries`, skip semantics, loading state handling, and inference-safe hook usage. Use when wiring Syncore into React apps, realtime or reactive UI, or debugging hook inference and subscription lifecycle issues.
---

# Syncore React Realtime

Use this skill when wiring Syncore into React apps or debugging hook inference,
watch lifecycle, or result propagation.

## Documentation Sources

Read these first from the current app:

- `package.json`
- `syncore/_generated/api.ts`
- provider wrappers or bootstrap files in the app
- installed `syncorejs/react` docs or type declarations
- installed adapter docs for `syncorejs/browser/react`, `syncorejs/expo/react`, `syncorejs/node/ipc/react`, or `syncorejs/next`

## Instructions

### Provider First

Every hook depends on `SyncoreProvider` or a platform wrapper that mounts it
for you.

```tsx
import { SyncoreProvider } from "syncorejs/react";

<SyncoreProvider client={client}>{children}</SyncoreProvider>;
```

Common wrapper providers are:

- `SyncoreBrowserProvider` from `syncorejs/browser/react`
- `SyncoreElectronProvider` from `syncorejs/node/ipc/react`
- `SyncoreExpoProvider` from `syncorejs/expo/react`
- `SyncoreNextProvider` from `syncorejs/next`

### useQuery

`useQuery` returns `undefined` while the first result is still loading.

```tsx
import { useQuery } from "syncorejs/react";
import { api } from "../syncore/_generated/api";

function Tasks() {
  const tasks = useQuery(api.tasks.list) ?? [];
  return <pre>{JSON.stringify(tasks, null, 2)}</pre>;
}
```

Use `skip` to suppress the subscription entirely:

```tsx
import { skip, useQuery } from "syncorejs/react";

const results = useQuery(
  api.notes.search,
  searchText.trim() ? { query: searchText.trim() } : skip
);
```

### useMutation And useAction

```tsx
import { useAction, useMutation } from "syncorejs/react";
import { api } from "../syncore/_generated/api";

const createTask = useMutation(api.tasks.create);
const exportTasks = useAction(api.tasks.exportTasks);
```

### Components In React

If the app installs Syncore components, React code usually consumes:

- `api.*` for root app functions
- `components.<alias>.*` for installed component public functions

```tsx
import { components } from "../syncore/_generated/api";

const entry = useQuery(components.cache.get, { key: "home" });
```

## Best Practices

- Always mount hooks under `SyncoreProvider` or a platform wrapper provider
- Prefer inference over manual generics
- Handle `undefined` loading state explicitly
- Use `skip` instead of hand-rolled conditional subscriptions
- Keep React code thin over the generated API and client surface
- Use generated `components` refs for installed component public APIs

## Common Pitfalls

1. Calling hooks outside a Syncore provider
2. Treating manual generics as the desired steady state for app code
3. Forgetting loading-state handling for the initial subscription
4. Using root `api` refs when the function actually comes from an installed component
5. Working around inference issues without first checking the installed package and generated API

## References

- `package.json`
- `syncore/_generated/api.ts`
- app provider or bootstrap files
