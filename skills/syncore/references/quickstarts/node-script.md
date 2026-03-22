# Node Script Quickstart

Use this setup when you want to run Syncore directly inside a local Node
process without React, Expo, Electron, or Next.

## 1. Create the project

```bash
mkdir my-syncore-script
cd my-syncore-script
npm init -y
```

## 2. Install packages

```bash
npm install syncorejs
npm install -D tsx typescript @types/node
```

## 3. Start the Syncore dev loop

```bash
npx syncorejs dev
```

Project-local operational commands typically target `project`.

## 4. Create the script

`script.ts`

```ts
import path from "node:path";
import { withNodeSyncoreClient } from "syncorejs/node";
import { api } from "./syncore/_generated/api";
import schema from "./syncore/_generated/schema";
import { resolvedComponents } from "./syncore/_generated/components";
import { functions } from "./syncore/_generated/functions";

await withNodeSyncoreClient(
  {
    databasePath: path.join(process.cwd(), ".syncore", "syncore.db"),
    storageDirectory: path.join(process.cwd(), ".syncore", "storage"),
    schema,
    functions,
    components: resolvedComponents
  },
  async (client) => {
    await client.mutation(api.tasks.create, { text: "Run from Node" });
    console.log(await client.query(api.tasks.list));
  }
);
```

## 5. Run the script

```bash
npx tsx script.ts
```
