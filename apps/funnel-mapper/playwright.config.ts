import { defineConfig, devices } from "@playwright/test";

// Local Supabase must be running and seeded: `npx supabase start && npx supabase db reset`.
// PW_CHROMIUM_PATH lets you point at a preinstalled Chromium (e.g. /opt/pw-browsers/chromium in CI sandboxes).
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const CAPTURE_URL_TEMPLATE = "http://localhost:4010/shot?url={url}";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? (process.env.E2E_PROD ? "http://localhost:3100" : "http://localhost:3000"),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "tests/e2e/.auth/demo.json", launchOptions: { executablePath } }, dependencies: ["setup"] },
  ],
  // E2E_PROD=1 runs against a production build (`npm run build` first): faster and closest to what teammates use.
  // The app is started with CAPTURE_URL_TEMPLATE pointing at a local stand-in for the screenshot service (tests/e2e/capture-stub.mjs).
  webServer: [
    { command: "node tests/e2e/capture-stub.mjs", url: "http://localhost:4010/health", reuseExistingServer: true, timeout: 20_000 },
    process.env.E2E_PROD
      ? { command: "npm run start -- -p 3100", url: "http://localhost:3100/login", reuseExistingServer: true, timeout: 120_000, env: { CAPTURE_URL_TEMPLATE } }
      : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 180_000, env: { CAPTURE_URL_TEMPLATE } },
  ],
});
