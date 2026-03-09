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
    await client.mutation(api.tasks.create, { text: "Run locally" });
    console.log(await client.query(api.tasks.list));
  }
);
