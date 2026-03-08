import { expect, test } from "@playwright/test";

test("Next PWA stays usable offline after the first load", async ({ context, page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Syncore runs fully local in the browser." })
  ).toBeVisible();

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

  const todoText = `Offline todo ${Date.now()}`;
  await page.getByPlaceholder("Write a local task").fill(todoText);
  await page.getByRole("button", { name: "Add offline" }).click();
  await expect(page.getByText(todoText)).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Syncore runs fully local in the browser." })
  ).toBeVisible();
  await expect(page.getByText(todoText)).toBeVisible();

  await context.setOffline(false);
});
