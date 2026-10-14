import { expect, test } from "@playwright/test";
import { mockWeather } from "./helpers/mocks";

// M8: Lighthouse no longer has a PWA category (VERIFICATIONS row 15), so installability and
// offline are asserted here: manifest, a controlling service worker, and a cold offline open.
test.describe("PWA", () => {
  test.skip(({ viewport }) => viewport?.width !== 390, "one viewport is enough");

  test("installs a service worker that controls the page", async ({ page }) => {
    await page.goto("/today");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
    await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });

  test("opens offline after the first visit, with every tab and a quick weather pick", async ({ page, context }) => {
    await mockWeather(page);
    await page.goto("/today");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload(); // now controlled, precache complete
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);

    await context.setOffline(true);
    for (const [path, heading] of [
      ["/today", "What should I wear?"],
      ["/closet", "Your closet"],
      ["/history", "History"],
      ["/settings", "Settings"],
      ["/scan", "Snap it once"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
    await expect(page.getByText("You are offline")).toBeVisible();
    await context.setOffline(false);
  });
});
