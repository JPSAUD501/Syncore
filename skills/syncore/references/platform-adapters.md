# Syncore Platform Adapters

## Core Rule

The Syncore runtime stays local. Adapters only provide environment-specific IO:

- SQLite access
- filesystem or storage APIs
- transport to UI layers
- timers and lifecycle hooks

Keep adapter code thin and user functions portable.

## Prefer Public Entry Points

For app-facing setup, prefer the public `syncorejs/*` surface:

- `syncorejs/node`
- `syncorejs/node/ipc`
- `syncorejs/node/ipc/react`
- `syncorejs/browser`
- `syncorejs/browser/react`
- `syncorejs/expo`
- `syncorejs/expo/react`
- `syncorejs/next`
- `syncorejs/next/config`
- `syncorejs/svelte`

## Node Script

```ts
import path from "node:path";
import { withNodeSyncoreClient } from "syncorejs/node";
import { api } from "./syncore/_generated/api";
import schema from "./syncore/schema";
import { functions } from "./syncore/_generated/functions";
import { resolvedComponents } from "./syncore/_generated/components";

await withNodeSyncoreClient(
  {
    databasePath: path.join(process.cwd(), ".syncore", "syncore.db"),
    storageDirectory: path.join(process.cwd(), ".syncore", "storage"),
    schema,
    functions,
    components: resolvedComponents
  },
  async (client) => {
    console.log(await client.query(api.tasks.list));
  }
);
```

## Electron

Run Syncore in the main process, not the renderer:

```ts
import path from "node:path";
import { app } from "electron";
import { createNodeSyncoreRuntime } from "syncorejs/node";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";
import { resolvedComponents } from "../syncore/_generated/components";

const runtime = createNodeSyncoreRuntime({
  databasePath: path.join(app.getPath("userData"), "syncore.db"),
  storageDirectory: path.join(app.getPath("userData"), "storage"),
  schema,
  functions,
  components: resolvedComponents,
  platform: "electron-main"
});
```

## Browser Worker

```ts
/// <reference lib="webworker" />

import { createBrowserWorkerRuntime } from "syncorejs/browser";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";
import { resolvedComponents } from "../syncore/_generated/components";

void createBrowserWorkerRuntime({
  endpoint: self,
  schema,
  functions,
  components: resolvedComponents,
  databaseName: "my-syncore-app",
  persistenceMode: "opfs"
});
```

When mounted through `SyncoreBrowserProvider`, the React tree should see
`starting/booting` while the worker client is being created. Worker creation
failures should surface as runtime status, typically
`unavailable/worker-unavailable`, instead of crashing the initial render.

The same browser-worker client can be used from Svelte bindings. In that case,
set the managed client once with `setSyncoreClient(managed.client)` and derive
runtime lifecycle with `createSyncoreStatusStore()`.

## Expo

```ts
import { createExpoSyncoreBootstrap } from "syncorejs/expo";
import schema from "../syncore/schema";
import { functions } from "../syncore/_generated/functions";
import { resolvedComponents } from "../syncore/_generated/components";

export const syncore = createExpoSyncoreBootstrap({
  schema,
  functions,
  components: resolvedComponents,
  databaseName: "syncore.db",
  storageDirectoryName: "syncore-storage"
});
```

`SyncoreExpoProvider` should behave like a deferred bootstrap: mount the tree
immediately, expose `starting/booting`, and transition to `ready` or an
unavailable runtime state once `bootstrap.getClient()` resolves.

## Next PWA

```ts
import { withSyncoreNext } from "syncorejs/next/config";

export default withSyncoreNext({
  output: "export"
});
```

`SyncoreNextProvider` should avoid creating worker-backed clients during server
render. The provider should mount with a booting runtime state and only attempt
worker startup on the client, promoting startup failures to runtime lifecycle
state rather than a 500 during SSR.

## Svelte

Use `syncorejs/svelte` when the app host is Svelte or SvelteKit:

- `setSyncoreClient(...)` installs the active client for the binding
- `createQueryStore(...)` is the simple reactive query path
- `createQueriesStore(...)` preserves keyed per-query state
- `createPaginatedQueryStore(...)` exposes app-ready pagination state
- `createSyncoreStatusStore()` mirrors `watchRuntimeStatus()`

The capability target should match React even though the ergonomics are store
based instead of hook based.

## Best Practices

- keep the runtime in the environment best suited for local storage and lifecycle control
- preserve typed refs across transports and clients
- pass `resolvedComponents` when the app installs components
- use the current app bootstrap files as the source of truth for target-specific wiring
- model worker, IPC, and bootstrap failures as runtime lifecycle state in app bindings

## Common Pitfalls

1. running Electron storage or SQLite directly in the renderer
2. forgetting to pass generated `resolvedComponents` when components are installed
3. missing environment-specific assets such as SQL.js wasm files or worker config
4. solving adapter typing issues with app-level casts instead of checking the installed package surface
5. mixing app runtime concerns into shared business logic
