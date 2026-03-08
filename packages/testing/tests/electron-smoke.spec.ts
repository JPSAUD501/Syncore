import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron as electron, expect, test } from "@playwright/test";

const workspaceRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const exampleRoot = path.join(workspaceRoot, "examples", "electron");

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

    await expect(
      firstWindow.getByRole("heading", {
        name: "Syncore stays on disk and reacts instantly in the renderer."
      })
    ).toBeVisible();

    const taskText = `Electron smoke ${Date.now()}`;
    await firstWindow.getByLabel("Task draft").fill(taskText);
    await firstWindow.getByRole("button", { name: "Add task" }).click();

    await expect(firstWindow.getByText(taskText)).toBeVisible();
    await expect(firstWindow.getByText("Total tasks: 1")).toBeVisible();

    await firstLaunch.close();
    firstLaunch = undefined;

    secondLaunch = await launchElectronApp(userDataDirectory);
    const secondWindow = await secondLaunch.firstWindow();

    await expect(secondWindow.getByText(taskText)).toBeVisible();
    await expect(secondWindow.getByText("Total tasks: 1")).toBeVisible();

    await secondWindow.getByRole("button", { name: "Complete" }).click();
    await expect(secondWindow.getByText("Completed on this machine")).toBeVisible();
    await expect(secondWindow.getByText("Completed: 1")).toBeVisible();

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

  return electron.launch({
    executablePath,
    cwd: exampleRoot,
    args: [path.join(exampleRoot, "dist", "src", "main.js")],
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
