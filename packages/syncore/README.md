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
import { defineSchema, defineTable, query, mutation, v } from "syncorejs";
import { useQuery, useMutation } from "syncorejs/react";
import { createBrowserWorkerClient } from "syncorejs/browser";
import { SyncoreNextProvider } from "syncorejs/next";
```

## Docs

- Repository: https://github.com/JPSAUD501/Syncore
- Quickstarts: https://github.com/JPSAUD501/Syncore/tree/main/docs/quickstarts
