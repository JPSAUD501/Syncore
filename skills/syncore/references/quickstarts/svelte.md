# Svelte Quickstart

Use this setup when the app host is Svelte or SvelteKit and the runtime should
still stay fully local in a browser worker.

## 1. Create the app host

Start from a Svelte or SvelteKit app that already builds.

## 2. Install packages

```bash
npm install syncorejs svelte sql.js
```

## 3. Start the Syncore dev loop

```bash
npx syncorejs dev
```

## 4. Add the worker runtime

`src/syncore.worker.ts`

```ts
/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  databaseName: "my-syncore-svelte",
  persistenceMode: "opfs"
});
```

## 5. Install the client into the Svelte binding

`src/App.svelte`

```svelte
<script lang="ts">
  import { onDestroy } from "svelte";
  import { createBrowserWorkerClient } from "syncorejs/browser";
  import {
    createQueryStore,
    createSyncoreStatusStore,
    setSyncoreClient
  } from "syncorejs/svelte";
  import { api } from "../syncore/_generated/api";

  const managed = createBrowserWorkerClient({
    workerUrl: new URL("./syncore.worker.ts", import.meta.url)
  });

  setSyncoreClient(managed.client);

  const tasksStore = createQueryStore(api.tasks.list);
  const runtimeStore = createSyncoreStatusStore();

  onDestroy(() => {
    managed.dispose();
  });
</script>

{#if $runtimeStore.kind !== "ready"}
  <p>Syncore status: {$runtimeStore.kind}</p>
{:else}
  <pre>{JSON.stringify($tasksStore.data ?? [], null, 2)}</pre>
{/if}
```

## 6. Reach for richer stores when the app needs them

- use `createQueryStore(...)` for the simple path
- use `createQueriesStore(...)` for keyed compositions
- use `createPaginatedQueryStore(...)` for app-ready pagination
- use `createSyncoreStatusStore()` for local runtime lifecycle

## 7. Run the app

```bash
npm run dev
```
