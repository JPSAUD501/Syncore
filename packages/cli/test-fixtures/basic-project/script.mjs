import path from "node:path";
import { withNodeSyncoreClient } from "syncorejs/node";
import { api } from "./syncore/_generated/api.ts";
import schema from "./syncore/_generated/schema.ts";
import { resolvedComponents } from "./syncore/_generated/components.ts";
import { functions } from "./syncore/_generated/functions.ts";

await withNodeSyncoreClient(
  {
    databasePath: path.join(process.cwd(), ".syncore", "syncore.db"),
    storageDirectory: path.join(process.cwd(), ".syncore", "storage"),
    schema,
    functions,
    components: resolvedComponents
  },
  async (client) => {
    await client.mutation(api.tasks.create, { text: "Run locally" });
    console.log(await client.query(api.tasks.list));
  }
);
