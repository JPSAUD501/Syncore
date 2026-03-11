import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "..");
const prereleaseTag = process.argv[2] ?? "beta";
const preStatePath = path.join(workspaceRoot, ".changeset", "pre.json");

async function main() {
  const preState = await readPreState();
  if (preState === null) {
    await runCommand("bunx", ["changeset", "pre", "enter", prereleaseTag]);
    return;
  }

  if (preState.mode !== "pre") {
    throw new Error(
      `Changesets prerelease mode is ${JSON.stringify(preState.mode)}. Expected "pre".`
    );
  }

  if (preState.tag !== prereleaseTag) {
    throw new Error(
      `Changesets prerelease tag is ${JSON.stringify(preState.tag)}. Expected ${JSON.stringify(prereleaseTag)}.`
    );
  }
}

async function readPreState() {
  try {
    return JSON.parse(await readFile(preStatePath, "utf8"));
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

function isMissingFileError(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")} (exit ${code ?? "unknown"})`
        )
      );
    });
  });
}

await main();
