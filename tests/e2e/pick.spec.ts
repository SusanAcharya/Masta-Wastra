import { expect, test } from "@playwright/test";
import { mockWeather } from "./helpers/mocks";
import { seedCloset } from "./helpers/seed";

// The service worker would fetch around page.route mocks (weather, /api/tag); pwa.spec
// covers the worker itself.
test.use({ serviceWorkers: "block" });

test.describe("pick my outfit", () => {
  test.skip(({ viewport }) => viewport?.width !== 390, "one viewport is enough");

  test("picks one outfit for the weather, shows another, wears it, logs history", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await mockWeather(page);
    await seedCloset(page);

    await page.getByRole("button", { name: "Set my location" }).click();
    const place = page.getByRole("dialog", { name: "Where are you today?" });
    await place.getByRole("searchbox").fill("Kathmandu");
    await place.getByRole("button", { name: "Search for a city" }).click();
    await place.getByRole("button", { name: /Kathmandu/ }).click();
    await expect(page.getByRole("region", { name: "Today's weather" })).toContainText("Kathmandu");

    await page.getByRole("button", { name: "Pick my outfit" }).click();
    const card = page.getByRole("article").last();
    await expect(card).toBeVisible();
    const first = (await card.getAttribute("aria-label"))!;
    expect(first.length).toBeGreaterThan(10);

    await page.getByRole("button", { name: "Show another" }).click();
    await expect(page.getByRole("article")).toHaveCount(1, { timeout: 10_000 }); // the old card has left
    await expect(card).not.toHaveAttribute("aria-label", first);

    await card.press("ArrowRight"); // keyboard: wear it
    await expect(page.getByText("Wearing today")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share this outfit" })).toBeVisible();

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "History" }).click();
    await expect(page.getByRole("button", { name: /pieces worn/ })).toHaveCount(1, { timeout: 10_000 });
    expect(errors).toEqual([]);
  });

  test("asks once which figure to dress, then shows the outfit on it", async ({ page }) => {
    await mockWeather(page);
    await seedCloset(page);
    await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => { const r = indexedDB.open("masta-wastra"); r.onsuccess = () => res(r.result); });
      await new Promise<void>((res) => { const t = db.transaction("settings", "readwrite"); const s = t.objectStore("settings"); const g = s.get("me"); g.onsuccess = () => { const v = { ...g.result }; delete v.figure; s.put(v); }; t.oncomplete = () => res(); });
    });
    await page.reload();
    await page.getByRole("button", { name: "Set my location" }).click();
    await page.getByRole("searchbox").fill("Kathmandu");
    await page.getByRole("button", { name: "Search for a city" }).click();
    await page.getByRole("button", { name: /Kathmandu/ }).click();
    await expect(page.getByRole("region", { name: "Today's weather" })).toContainText("Kathmandu");

    await page.getByRole("button", { name: "Pick my outfit" }).click();
    const choice = page.getByRole("dialog", { name: "Show outfits on" });
    await choice.getByRole("button", { name: "Man", exact: true }).click();
    const card = page.getByRole("article").last();
    await expect(card).toBeVisible(); // the pick carried on by itself
    // Every piece of the outfit is drawn on the figure, as a labelled image.
    expect(await card.getByRole("img").count()).toBeGreaterThanOrEqual(3);

    await page.getByRole("button", { name: "Show another" }).click();
    await expect(page.getByRole("dialog", { name: "Show outfits on" })).toHaveCount(0); // asked once
  });

  test("offers to cut older pieces out again", async ({ page }) => {
    await seedCloset(page);
    await page.goto("/closet");
    await expect(page.getByText("10 pieces can be cut out better.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cut them out again" })).toBeVisible();
  });
});
