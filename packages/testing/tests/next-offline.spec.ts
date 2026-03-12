import { expect, test } from "@playwright/test";

test("Next PWA stays usable offline after the first load", async ({ context, page }) => {
  const taskInList = (title: string) =>
    page.locator(".task-list").getByText(title, { exact: true });
  const taskInput = page.getByPlaceholder("What needs to be done?");
  const addTaskButton = page.getByRole("button", { name: "Add task" });

  await page.goto("/");
  await expect(taskInput).toBeVisible();
  await expect(addTaskButton).toBeVisible();

  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) {
      return false;
    }
    await navigator.serviceWorker.ready;
    return true;
  });

  await page.reload();
  await page.waitForFunction(
    () => "serviceWorker" in navigator && navigator.serviceWorker.controller !== null
  );
  await page.waitForFunction(
    () => (window as Window & { __syncorePlannerReady?: boolean }).__syncorePlannerReady === true
  );
  await expect(taskInput).toBeVisible();
  await expect(addTaskButton).toBeVisible();

  const taskTitle = `Offline task ${Date.now()}`;
  await taskInput.fill(taskTitle);
  await addTaskButton.click();
  await expect(taskInList(taskTitle)).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(taskInput).toBeVisible();
  await expect(addTaskButton).toBeVisible();
  await expect(taskInList(taskTitle)).toBeVisible();

  await context.setOffline(false);
});
