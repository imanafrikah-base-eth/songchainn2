import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // e2e/live runs against the production site and only on purpose:
  //   npx playwright test --config playwright.live.config.ts
  testIgnore: ["**/live/**"],
  // 60s per test: the suite runs against the Vite dev server, which compiles
  // routes on first visit and serves hundreds of modules unbundled.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Three browsers is what one Vite dev server can feed without a test
  // starving; more than that and a healthy page times out under contention.
  workers: 1,
  retries: 0,
  reporter: "list",
  // Warm the dev server first: Vite optimises dependencies on the first
  // request and reloads the page while doing it, which detached the frame
  // under the first tests of a cold run.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    video: "off",
    screenshot: "only-on-failure",
  },
  webServer: {
    // The suite runs against a production build served by vite preview, not the
    // dev server. Dev compiles every route on first visit and serves hundreds of
    // unbundled modules, so with three browsers in flight healthy pages timed
    // out and the suite never reported the same result twice. The preview is
    // what production ships, and it is fast. A running preview is reused.
    command: "npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 600_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
  ],
});
