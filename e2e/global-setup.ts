import { chromium, type FullConfig } from "@playwright/test";

/**
 * Warm the dev server before any test runs.
 *
 * On a cold start Vite discovers dependencies during the first requests,
 * optimises them, and reloads the page in the middle of whatever test got
 * there first. That produced "frame was detached" failures on the first
 * three tests of every fresh run, none of which were real. Visiting the
 * heaviest routes once here, and waiting for the network to settle, means
 * the optimiser has done its work before a test opens a page.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://127.0.0.1:4173";
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const routes = ["/", "/about", "/marketplace", "/wavewarz-africa/battles/live", "/world-builder"];
  for (const route of routes) {
    try {
      await page.goto(baseURL + route, { waitUntil: "networkidle", timeout: 90_000 });
    } catch {
      // A slow first compile is exactly what this is for; keep going.
    }
  }
  // A second pass of the landing page after the optimiser's reload.
  try {
    await page.goto(baseURL + "/", { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1500);
  } catch {
    // ignore
  }
  await browser.close();
}
