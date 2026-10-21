import { defineConfig } from "@playwright/test";

// Browser walkthrough of a deployed site. Started by scripts/deploy/live-check.mjs, which creates (and later
// deletes) a temporary team member and passes LIVE_SITE_URL / LIVE_EMAIL / LIVE_PASSWORD / LIVE_STAMP.
// Behind an HTTPS-intercepting proxy (like a sandbox), traffic goes through HTTPS_PROXY and its certificate is accepted.
const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy;
export const liveContext = {
  baseURL: process.env.LIVE_SITE_URL,
  ...(proxyServer ? { proxy: { server: proxyServer, bypass: "localhost,127.0.0.1" }, ignoreHTTPSErrors: true } : {}),
};

export default defineConfig({
  testDir: "tests/live",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    ...liveContext,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
});
