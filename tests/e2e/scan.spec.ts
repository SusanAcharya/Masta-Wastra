import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { mockTagging, mockWeather } from "./helpers/mocks";

const FIXTURES = join(__dirname, "..", "fixtures", "garments");
const photos = readdirSync(FIXTURES)
  .filter((f) => f.endsWith(".jpg"))
  .sort()
  .map((f) => join(FIXTURES, f));

// The service worker would fetch around page.route mocks (weather, /api/tag); pwa.spec
// covers the worker itself.
test.use({ serviceWorkers: "block" });

test.describe("closet scan", () => {
  test.skip(({ isMobile }) => !isMobile, "phone flow");

  test("crop by hand path: no model, no questions, piece is recognised", async ({ page }, info) => {
    test.skip(info.project.name !== "phone-390", "one phone size is enough for this path");
    const tagged = await mockTagging(page, [photos[0]]);
    await page.goto("/scan");
    await expect(page.getByRole("heading", { name: "Snap it once" })).toBeVisible();
    await page.getByLabel("Choose photos").setInputFiles(photos[0]);

    const model = page.getByRole("dialog", { name: "One time setup" });
    await expect(model).toContainText("Google Gemini");
    await model.getByRole("button", { name: "Later, I will crop by hand" }).click();

    const crop = page.getByRole("dialog", { name: "Crop by hand" });
    await crop.getByRole("button", { name: "Top left corner" }).press("ArrowRight");
    await crop.getByRole("button", { name: "Use this crop" }).click();

    // No tag form: the piece files itself and the queue recognises it.
    await expect(page.getByRole("progressbar", { name: "Closet scan progress" })).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => tagged.length).toBe(1);

    await page.goto("/closet");
    await expect(page.locator("header").getByText("1 piece")).toBeVisible();
  });

  test("15 photos at once: cut out, recognised, then an outfit is picked and worn", async ({ page, context }, info) => {
    test.skip(info.project.name !== "phone-390", "slow: downloads the 56 MB model once");
    test.setTimeout(20 * 60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const tagged = await mockTagging(page, photos);
    await mockWeather(page);

    await page.goto("/scan");
    await page.getByLabel("Choose photos").setInputFiles(photos);
    const model = page.getByRole("dialog", { name: "One time setup" });
    await model.getByRole("button", { name: "Download now" }).click();
    await expect(model).toBeHidden({ timeout: 10 * 60_000 });

    // Unclean cuts are kept as they are; everything else needs no input at all.
    const bar = page.getByRole("progressbar", { name: "Closet scan progress" });
    await expect(async () => {
      const unclean = page.getByRole("dialog", { name: "That one did not cut cleanly." });
      if (await unclean.isVisible()) await unclean.getByRole("button", { name: "Keep as it is" }).click();
      expect(await bar.getAttribute("aria-valuenow")).toBe("15");
    }).toPass({ timeout: 10 * 60_000, intervals: [2000] });

    await expect.poll(() => tagged.length, { timeout: 120_000 }).toBe(15);
    await expect(page.getByRole("list", { name: "Added this session" }).getByRole("img")).toHaveCount(15);
    await page.screenshot({ path: info.outputPath("scan-15.png"), fullPage: true });

    // Pick my outfit for a mild day in Kathmandu.
    await page.getByRole("link", { name: "Pick my outfit" }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.getByRole("button", { name: "Set my location" }).click();
    const place = page.getByRole("dialog", { name: "Where are you today?" });
    await place.getByRole("searchbox").fill("Kathmandu");
    await place.getByRole("button", { name: "Search for a city" }).click();
    await place.getByRole("button", { name: /Kathmandu/ }).click();
    await expect(page.getByRole("region", { name: "Today's weather" })).toContainText("Kathmandu");

    await page.getByRole("button", { name: "Pick my outfit" }).click();
    const card = page.getByRole("article").last();
    await expect(card).toBeVisible();
    const first = await card.getAttribute("aria-label");
    expect(first?.length).toBeGreaterThan(10);
    await page.screenshot({ path: info.outputPath("pick-1.png"), fullPage: true });

    await page.getByRole("button", { name: "Show another" }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(card).not.toHaveAttribute("aria-label", first!);
    await page.getByRole("button", { name: "Wear this" }).click();
    await expect(page.getByText("Wearing today")).toBeVisible();
    await page.screenshot({ path: info.outputPath("pick-worn.png"), fullPage: true });

    // History shows today's wear on the calendar (M7).
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "History" }).click();
    const day = page.getByRole("button", { name: /pieces worn/ });
    await expect(day).toHaveCount(1);
    await day.click();
    await expect(page.getByRole("img").first()).toBeVisible();
    await page.screenshot({ path: info.outputPath("history.png"), fullPage: true });

    // The closet holds all 15, recognised (no "Recognising" left).
    await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Closet" }).click();
    await expect(page.locator("header").getByText("15 pieces")).toBeVisible();
    await expect(page.getByText("Recognising")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("closet.png"), fullPage: true });

    expect(errors).toEqual([]);
    void context;
  });
});
