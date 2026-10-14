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
    await expect(page.getByRole("article")).toHaveCount(1); // the old card has left
    await expect(card).not.toHaveAttribute("aria-label", first);

    await card.press("ArrowRight"); // keyboard: wear it
    await expect(page.getByText("Wearing today")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share this outfit" })).toBeVisible();

    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "History" }).click();
    await expect(page.getByRole("button", { name: /pieces worn/ })).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
