import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron as electron, expect, test } from "@playwright/test";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const exampleRoot = path.join(workspaceRoot, "examples", "electron");
const electronMainEntry = path.join(
  exampleRoot,
  "dist",
  "examples",
  "electron",
  "src",
  "main.js"
);

test("Electron example persists local state across app relaunches", async () => {
  const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), "syncore-electron-smoke-"));
  let firstLaunch:
    | Awaited<ReturnType<typeof launchElectronApp>>
    | undefined;
  let secondLaunch:
    | Awaited<ReturnType<typeof launchElectronApp>>
    | undefined;

  try {
    firstLaunch = await launchElectronApp(userDataDirectory);
    const firstWindow = await firstLaunch.firstWindow();
    const editor = firstWindow.getByPlaceholder(
      "What happened today? How are you feeling?"
    );
    const deleteButton = firstWindow.getByRole("button", { name: "Delete" });
    await expect(editor).toBeVisible();

    const entryText = `Electron smoke ${Date.now()} captured through the renderer bridge`;
    await editor.fill(entryText);

    await expect(deleteButton).toBeVisible();
    await expect(firstWindow.getByText(entryText)).toBeVisible();

    await firstLaunch.close();
    firstLaunch = undefined;

    secondLaunch = await launchElectronApp(userDataDirectory);
    const secondWindow = await secondLaunch.firstWindow();
    const relaunchedEditor = secondWindow.getByPlaceholder(
      "What happened today? How are you feeling?"
    );

    await expect(relaunchedEditor).toHaveValue(entryText);
    await expect(secondWindow.getByRole("button", { name: "Delete" })).toBeVisible();

    await secondWindow.getByRole("button", { name: "Delete" }).click();
    await expect(secondWindow.getByRole("button", { name: "Delete" })).toHaveCount(0);
    await expect(relaunchedEditor).toHaveValue("");

    await secondLaunch.close();
    secondLaunch = undefined;
  } finally {
    await firstLaunch?.close().catch(() => undefined);
    await secondLaunch?.close().catch(() => undefined);
    await removeDirectoryBestEffort(userDataDirectory);
  }
});

async function launchElectronApp(userDataDirectory: string) {
  const requireFromExample = createRequire(path.join(exampleRoot, "package.json"));
  const executablePath = requireFromExample("electron") as string;
  const electronArgs = [electronMainEntry];

  // GitHub-hosted Linux runners do not provide a configured setuid sandbox.
  if (process.platform === "linux") {
    electronArgs.unshift("--disable-setuid-sandbox", "--no-sandbox");
  }

  return electron.launch({
    executablePath,
    cwd: exampleRoot,
    args: electronArgs,
    env: {
      ...process.env,
      SYNCORE_ELECTRON_USER_DATA_DIR: userDataDirectory
    }
  });
}

async function removeDirectoryBestEffort(directory: string): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (true) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
