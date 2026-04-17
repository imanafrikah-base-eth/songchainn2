import { expect, test } from "@playwright/test";

test.describe("Core smoke", () => {
  test("loads auth/landing and key sections", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByText("$ongChainn", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("WaveWarz", { exact: false }).first()).toBeVisible();
  });

  test("direct routes render without crash", async ({ page }) => {
    const routes = ["/about", "/install", "/reset-password"];
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("battlezone route mounts", async ({ page }) => {
    await page.goto("/wavewarz-africa/battles/live", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByText("Live", { exact: false }).first()).toBeVisible();
  });
});
