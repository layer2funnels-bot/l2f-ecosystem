import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Fails on serious/critical WCAG 2.1 A/AA issues. React Flow's canvas internals are excluded (third-party SVG).
async function scan(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".react-flow__minimap").analyze();
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
  expect(bad, `${label}\n${summary}`).toEqual([]);
}

const PAGES: [string, string][] = [
  ["dashboard", "/"],
  ["clients", "/clients"],
  ["client portfolio", "/clients/10000000-0000-4000-8000-000000000001"],
  ["new client", "/clients/new"],
  ["templates", "/templates"],
  ["settings", "/settings"],
  ["funnel editor", "/funnels/20000000-0000-4000-8000-000000000002"],
];

for (const theme of ["light", "dark"] as const) {
  test.describe(`accessibility (${theme})`, () => {
    for (const [label, path] of PAGES) {
      test(label, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem("fm-theme", t), theme);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await scan(page, `${label} (${theme})`);
      });
    }
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`accessibility (${theme}): Simulate with changes on the map`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("fm-theme", t), theme);
    // a private copy so the change never touches the seeded demo funnel
    const { createFunnel, startSimulate } = await import("./helpers");
    const { id } = await createFunnel({ template: "quiz" });
    await page.goto(`/funnels/${id}`);
    await startSimulate(page);
    await page.getByLabel("Conversion rates").fill("0.8");
    await page.getByLabel("Traffic", { exact: true }).fill("1.3");
    await expect(page.locator(".fm-simchip").first()).toBeVisible();
    // the chips fade in: scan once they are fully opaque (a half-faded chip fails contrast by definition)
    await expect(page.locator(".fm-simchip").first()).toHaveCSS("opacity", "1");
    await scan(page, `Simulate (${theme})`);
  });
}

test.describe("accessibility (signed out)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("login", async ({ page }) => {
    await page.goto("/login");
    await scan(page, "login");
  });
  test("client share page", async ({ page }) => {
    await page.goto("/s/demo-share-token");
    await page.waitForLoadState("networkidle");
    await scan(page, "share page");
  });
});
