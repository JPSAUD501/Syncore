# Syncore React Realtime

## Provider First

Every hook depends on `SyncoreProvider` or a platform wrapper that mounts it:

```tsx
import { SyncoreProvider } from "syncorejs/react";

<SyncoreProvider client={client}>{children}</SyncoreProvider>;
```

Common wrapper providers:

- `SyncoreBrowserProvider` from `syncorejs/browser/react`
- `SyncoreElectronProvider` from `syncorejs/node/ipc/react`
- `SyncoreExpoProvider` from `syncorejs/expo/react`
- `SyncoreNextProvider` from `syncorejs/next`

## useQuery

`useQuery` returns `undefined` while the first result is still loading:

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

## useMutation and useAction

```tsx
import { useAction, useMutation } from "syncorejs/react";
import { api } from "../syncore/_generated/api";

const createTask = useMutation(api.tasks.create);
const exportTasks = useAction(api.tasks.exportTasks);
```

## Components in React

If the app installs Syncore components, React code usually consumes:

- `api.*` for root app functions
- `components.<alias>.*` for installed component public functions

```tsx
import { components } from "../syncore/_generated/api";

const entry = useQuery(components.cache.get, { key: "home" });
```

## Best Practices

- always mount hooks under a Syncore provider
- prefer inference over manual generics
- handle `undefined` loading state explicitly
- use `skip` instead of hand-rolled conditional subscriptions
- keep React code thin over the generated API and client surface

## Common Pitfalls

1. calling hooks outside a Syncore provider
2. treating manual generics as the desired steady state
3. forgetting loading-state handling for the initial subscription
4. using root `api` refs when the function actually comes from a component
5. working around inference issues without checking the installed package and generated API
