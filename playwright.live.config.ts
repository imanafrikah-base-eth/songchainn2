import { defineConfig, devices } from "@playwright/test";

/**
 * Checks against the LIVE site (www.songchainn.xyz), run on purpose only:
 *   npx playwright test --config playwright.live.config.ts
 * Nothing here starts a server, and the default suite never picks these up.
 */
export default defineConfig({
  testDir: "./e2e/live",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "https://www.songchainn.xyz", screenshot: "only-on-failure", serviceWorkers: "block" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
