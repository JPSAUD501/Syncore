# Node Script Quickstart

Use this setup when you want to run Syncore directly inside a local Node process
without React, Expo, Electron, or Next.

## 1. Create the project

```bash
mkdir my-syncore-script
cd my-syncore-script
npm init -y
npm pkg set type="module"
```

## 2. Install packages

```bash
npm install syncore
```

## 3. Start the Syncore dev loop

Run this in one terminal and leave it running:

```bash
npx syncore dev
```

On a fresh project, `syncore dev` scaffolds the minimal local backend and keeps
`syncore/_generated/*` up to date.

## 4. Create the script

`script.mjs`

```js
import path from "node:path";
import { withNodeSyncoreClient } from "syncore/node";
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

In a second terminal:

```bash
node script.mjs
```

You should see the local task list printed to the terminal.

To preload sample data from JSONL, use:

```bash
npx syncore import --table tasks sampleData.jsonl
```
