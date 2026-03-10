import { runSyncoreCli } from "@syncore/cli";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { runSyncoreCli };

function isDirectInvocation(moduleUrl: string): boolean {
  return (
    Boolean(process.argv[1]) &&
    realpathSync(path.resolve(process.argv[1])) ===
      realpathSync(path.resolve(fileURLToPath(moduleUrl)))
  );
}

if (isDirectInvocation(import.meta.url)) {
  void runSyncoreCli().catch((error) => {
    process.nextTick(() => {
      throw error;
    });
  });
}
