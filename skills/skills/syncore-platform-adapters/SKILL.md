---
name: syncore-platform-adapters
description: Integration patterns for Syncore across Node scripts, Electron, browser workers, web apps, Expo, Next PWA, browser ESM, and Svelte while preserving typed client references and local runtime behavior. Use when wiring Syncore into a concrete runtime, worker, provider, or client transport, or debugging adapter-specific behavior.
---

# Syncore Platform Adapters

Use this skill when wiring Syncore into a concrete runtime environment or
debugging adapter-specific behavior.

## Documentation Sources

Read these first from the current app:

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/components.ts`
- app bootstrap files such as `main.ts`, `syncore.worker.ts`, `lib/syncore.ts`, or provider wrappers
- installed `syncorejs` docs or type declarations

## Instructions

### Core Rule

The Syncore runtime stays local. Adapters only provide environment-specific IO:

- SQLite access
- filesystem or storage APIs
- transport to UI layers
- timers and lifecycle hooks

### Prefer Public Entry Points

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

### Node Script

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

### Electron

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

### Web Worker

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

### Expo

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

### Next PWA

```ts
import { withSyncoreNext } from "syncorejs/next/config";

export default withSyncoreNext({
  output: "export"
});
```

## Best Practices

- Keep the runtime in the environment best suited for local storage and lifecycle control
- Preserve typed references across transports and clients
- Keep adapter code thin and user functions portable
- Pass `resolvedComponents` when the app installs components
- Use the current app bootstrap files as the source of truth for target-specific wiring

## Common Pitfalls

1. Running Electron storage or SQLite directly in the renderer
2. Forgetting to pass generated `resolvedComponents` when components are installed
3. Missing environment-specific assets such as SQL.js wasm files or worker config
4. Solving adapter typing issues with app-level casts instead of checking the installed package surface
5. Mixing app runtime concerns into shared business logic

## References

- `package.json`
- `syncore.config.ts`
- `syncore/schema.ts`
- `syncore/components.ts`
- `syncore/_generated/functions.ts`
- `syncore/_generated/components.ts`
- app bootstrap files
