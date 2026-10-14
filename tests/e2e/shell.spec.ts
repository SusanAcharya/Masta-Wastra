import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SCREENS = ["/today", "/closet", "/history", "/settings", "/scan", "/about", "/offline"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    for (const path of SCREENS) {
      test(`${path} has no serious or critical axe violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
        const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
      });
    }
  });
}

test("tab bar labels are visible and the current tab is marked", async ({ page }) => {
  await page.goto("/closet");
  const nav = page.getByRole("navigation", { name: "Primary" });
  for (const label of ["Today", "Closet", "Scan", "History", "Settings"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "Closet" })).toHaveAttribute("aria-current", "page");
  const box = await nav.getByRole("link", { name: "Today" }).boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("a saved dark theme paints dark on first frame, before hydration", async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem("mw-theme", "dark"));
  await page.route(/\/_next\/static\/.*\.js$/, (route) => route.abort()); // no JS bundles, CSS still loads
  await page.goto("/today");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe("rgb(12, 11, 10)");
});

test("theme dialog switches the theme and remembers it", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Theme/ }).click();
  await page.getByRole("radio", { name: "Dark" }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: /Theme/ })).toContainText("Dark");
});

test("root sends a new visitor to Today", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/today$/);
});
