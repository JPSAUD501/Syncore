import { runSyncoreCli } from "@syncore/cli";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export { runSyncoreCli };

function isDirectInvocation(moduleUrl: string): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }

  return (
    realpathSync(path.resolve(invokedPath)) ===
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
