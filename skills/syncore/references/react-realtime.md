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

## useQueryState

Use `useQueryState` when the view needs explicit loading, error, or runtime
status:

```tsx
import { useQueryState } from "syncorejs/react";

const entry = useQueryState(api.entries.getByDate, { date: selectedDate });

if (entry.status === "loading") {
  return <div>Loading entry...</div>;
}

if (entry.status === "error") {
  return <div>{entry.error?.message}</div>;
}
```

## useQueries

Use `useQueries` for keyed compositions without losing per-query state:

```tsx
import { skip, useQueries } from "syncorejs/react";

const state = useQueries({
  entries: { query: api.entries.list },
  current: { query: api.entries.getByDate, args: { date: selectedDate } },
  search: {
    query: api.entries.search,
    args: searchText.trim() ? { query: searchText.trim() } : skip
  }
});
```

Each keyed entry exposes `data`, `error`, `status`, `runtimeStatus`,
`isLoading`, `isError`, and `isReady`.

## usePaginatedQuery

Use `usePaginatedQuery` for app-ready infinite lists backed by a paginated
Syncore query:

```tsx
import { usePaginatedQuery } from "syncorejs/react";

const feed = usePaginatedQuery(
  api.feed.list,
  { channel: "general" },
  { initialNumItems: 20 }
);

const items = feed.results;
```

The returned state includes `results`, `pages`, `status`, `isLoadingMore`,
`hasMore`, `cursor`, and `loadMore()`.

## useSyncoreStatus

Use `useSyncoreStatus` when the app shell needs to react to runtime lifecycle:

```tsx
import { useSyncoreStatus } from "syncorejs/react";

const runtime = useSyncoreStatus();
```

This is especially useful in worker, IPC, Expo, and other local-runtime
integrations where bootstrap and availability are first-class app states.

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
- reach for `useQueryState` or `useQueries` when the view needs state, not just data
- use `usePaginatedQuery` instead of hand-rolling cursor state in components
- use `useSyncoreStatus` for runtime lifecycle instead of out-of-band boot flags
- use `skip` instead of hand-rolled conditional subscriptions
- keep React code thin over the generated API and client surface

## Common Pitfalls

1. calling hooks outside a Syncore provider
2. treating manual generics as the desired steady state
3. forgetting loading-state handling for the initial subscription
4. using root `api` refs when the function actually comes from a component
5. working around inference issues without checking the installed package and generated API
