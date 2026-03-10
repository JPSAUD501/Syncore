import { runSyncoreCli } from "@syncore/cli";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { runSyncoreCli };

if (
  process.argv[1] &&
  realpathSync(path.resolve(process.argv[1])) ===
    realpathSync(path.resolve(fileURLToPath(import.meta.url)))
) {
  await runSyncoreCli();
}
