# Syncore

Syncore is a local-first reactive backend toolkit for offline apps. It brings a
Convex-like programming model to local runtimes backed by SQLite.

## Install

```bash
npm add syncorejs
```

## CLI

```bash
npx syncorejs dev
```

## Imports

```ts
import { defineSchema, defineTable, query, mutation, s } from "syncorejs";
import { useQuery, useMutation } from "syncorejs/react";
import { createBrowserWorkerClient } from "syncorejs/browser";
import { SyncoreNextProvider } from "syncorejs/next";
import { createTestSyncore } from "syncorejs/testing";
```

## Testing

```ts
import { createTestSyncore } from "syncorejs/testing";

await using t = await createTestSyncore({ schema, functions });
await t.mutation(api.tasks.create, { text: "Write tests" });
```

`createTestSyncore` runs an isolated in-memory runtime with no devtools and a
scheduler you drive with `t.runScheduledJobs()` / `t.finishScheduledJobs()`.

## Docs

- Repository: https://github.com/JPSAUD501/Syncore
- Quickstarts: https://github.com/JPSAUD501/Syncore/tree/main/docs/quickstarts

