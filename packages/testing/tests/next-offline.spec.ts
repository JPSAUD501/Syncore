import { expect, test } from "@playwright/test";

test("Next PWA stays usable offline after the first load", async ({ context, page }) => {
  const taskInList = (title: string) =>
    page.locator(".task-list").getByText(title, { exact: true });
  const plannerHeading = page.getByRole("heading", {
    name: "Plan locally. Stay useful offline."
  });

  await page.goto("/");
  await expect(plannerHeading).toBeVisible();

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
  await expect(plannerHeading).toBeVisible();

  const taskTitle = `Offline task ${Date.now()}`;
  await page.getByPlaceholder("Capture the next thing").fill(taskTitle);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(taskInList(taskTitle)).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(plannerHeading).toBeVisible();
  await expect(taskInList(taskTitle)).toBeVisible();

  await context.setOffline(false);
});
