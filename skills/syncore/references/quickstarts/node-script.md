# Node Script Quickstart

Use this setup when you want to run Syncore directly inside a local Node
process without React, Expo, Electron, or Next.

## 1. Create the project

```bash
mkdir my-syncore-script
cd my-syncore-script
npm init -y
npm pkg set type="module"
```

## 2. Install packages

```bash
npm install syncorejs
```

## 3. Start the Syncore dev loop

```bash
npx syncorejs dev
```

Project-local operational commands typically target `project`.

## 4. Create the script

`script.mjs`

```js
import path from "node:path";
import { withNodeSyncoreClient } from "syncorejs/node";
import { api } from "./syncore/_generated/api.ts";
import schema from "./syncore/schema.ts";
import { functions } from "./syncore/_generated/functions.ts";

await withNodeSyncoreClient(
  {
    databasePath: path.join(process.cwd(), ".syncore", "syncore.db"),
    storageDirectory: path.join(process.cwd(), ".syncore", "storage"),
    schema,
    functions
  },
  async (client) => {
    await client.mutation(api.tasks.create, { text: "Run from Node" });
    console.log(await client.query(api.tasks.list));
  }
);
```

## 5. Run the script

```bash
node script.mjs
```
