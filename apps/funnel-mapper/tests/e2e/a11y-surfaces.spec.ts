import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { blankGraph } from "../../lib/graph";
import { builtinTemplate } from "../../lib/templates";
import { createFunnel, node, openEditor, startSimulate } from "./helpers";

// Serious / critical WCAG 2.1 A/AA findings fail the run. This sweep covers the surfaces and states the page-level scans do not reach:
// every Reports section, dialogs, menus, Quick Add, Simulate (playing), presentation, the shared view, empty and phone states.
async function scan(page: Page, label: string) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude(".react-flow__minimap").analyze();
  const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const summary = bad.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n");
  expect(bad, `${label}\n${summary}`).toEqual([]);
}

const SECTIONS = ["overview", "data", "status", "sources", "offers", "expenses", "scenarios", "forecast", "goals", "mrr", "monthly", "reinvest"];
const g = builtinTemplate("quiz").graph;
const WIDGETS = [
  { id: "wa", type: "widget", name: "Widget", x: 0, y: -330, p: { scope: "funnel", display: "number", metrics: ["revenue", "profit", "mrr", "goal"], wsize: "L" } },
  { id: "wb", type: "widget", name: "Widget", x: 420, y: -330, p: { scope: "funnel", display: "trend", metrics: ["revenue"], wsize: "M" } },
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`accessibility sweep (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem("fm-theme", t), theme);
    });

    test("every Reports section", async ({ page }) => {
      test.setTimeout(240_000);
      const { id } = await createFunnel({
        graph: { ...g, nodes: [...g.nodes, ...WIDGETS] } as typeof g,
        settings: { goals: [{ id: "g1", name: "Revenue goal", kind: "revenue", value: 10000 }], scenarios: [{ id: "s1", name: "Best case", kind: "best", whatif: { traffic: 1.25, conv: 1.2, price: 1, cost: 0.9 } }], expenses: [{ id: "e1", name: "Software", kind: "monthly", amount: 300, category: "Software" }], reinvest: { pct: 30, months: 12 } } as never,
      });
      for (const s of SECTIONS) {
        await page.goto(`/funnels/${id}?view=reports&section=${s}`);
        await expect(page.locator(".fm-rmain")).toBeVisible();
        await page.waitForTimeout(500);
        await scan(page, `Reports ${s} (${theme})`);
      }
    });

    test("empty funnel: editor and Reports", async ({ page }) => {
      const { id } = await createFunnel({ graph: blankGraph() });
      await openEditor(page, id);
      await expect(page.locator(".fm-canvas-empty")).toBeVisible();
      await scan(page, `empty editor (${theme})`);
      await page.goto(`/funnels/${id}?view=reports&section=overview`);
      await expect(page.locator(".fm-rmain")).toBeVisible();
      await scan(page, `empty Reports (${theme})`);
    });

    test("editor overlays: Quick Add, context menu, type picker, share, help, shortcuts, Simulate playing, presentation", async ({ page }) => {
      test.setTimeout(240_000);
      const { id } = await createFunnel({ graph: { ...g, nodes: [...g.nodes, ...WIDGETS] } as typeof g });
      await openEditor(page, id);
      // Quick Add
      await page.locator(".react-flow__pane").dblclick({ position: { x: 300, y: 160 } });
      await expect(page.getByRole("dialog", { name: "Add a block" })).toBeVisible();
      await scan(page, `Quick Add (${theme})`);
      await page.keyboard.press("Escape");
      // context menu + Change block type
      await node(page, "Quiz funnel").click({ button: "right" });
      await expect(page.getByRole("menu")).toBeVisible();
      await scan(page, `block menu (${theme})`);
      await page.getByRole("menuitem", { name: /Change block type/ }).click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await scan(page, `type picker (${theme})`);
      await page.keyboard.press("Escape");
      // inspector with a Page URL / thumbnail field, then the Plan and Analytics tabs
      await node(page, "Quiz funnel").click();
      await scan(page, `page inspector (${theme})`);
      await page.getByRole("tab", { name: "Plan" }).click();
      await scan(page, `plan tab (${theme})`);
      await page.getByRole("tab", { name: "Analytics" }).click();
      await scan(page, `analytics tab (${theme})`);
      // widget inspector
      await page.locator('.react-flow__node-widget[data-id="wa"]').click();
      await scan(page, `widget inspector (${theme})`);
      // Simulate playing + Before
      await page.keyboard.press("Escape"); // leave the widget
      await startSimulate(page);
      const panel = page.getByLabel("Simulate", { exact: true });
      await panel.getByLabel("Conversion rates").fill("0.8");
      await panel.locator(".fm-playbtn").click();
      await expect(page.locator(".fm-flowdots circle").first()).toBeAttached();
      await scan(page, `Simulate playing (${theme})`);
      await panel.getByRole("button", { name: "Before", exact: true }).click();
      await scan(page, `Simulate before (${theme})`);
      await panel.getByRole("button", { name: "Done" }).click();
      // dialogs from the rail and header
      await page.getByRole("button", { name: "Help" }).click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await scan(page, `help (${theme})`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Keyboard shortcuts" }).click();
      await expect(page.getByRole("dialog").first()).toBeVisible();
      await scan(page, `shortcuts (${theme})`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Share/ }).first().click();
      await expect(page.getByRole("dialog", { name: /^Share with/ })).toBeVisible();
      await scan(page, `share dialog (${theme})`);
      await page.keyboard.press("Escape");
      // presentation
      await page.getByRole("button", { name: "Present" }).first().click();
      await expect(page.locator(".fm-present")).toBeVisible();
      await scan(page, `presentation overview (${theme})`);
      await page.getByRole("button", { name: "Next stage" }).click();
      await scan(page, `presentation stage (${theme})`);
    });

    test("shared view (with comments) and a revoked link", async ({ browser }) => {
      const { id, sb } = await createFunnel({ graph: { ...g, nodes: [...g.nodes, ...WIDGETS] } as typeof g });
      const live = await sb.from("share_links").insert({ funnel_id: id, allow_comments: true }).select("token").single();
      const gone = await sb.from("share_links").insert({ funnel_id: id, expires_at: new Date(Date.now() - 86400000).toISOString() }).select("token").single();
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      await ctx.addInitScript((t) => localStorage.setItem("fm-theme", t), theme);
      const p = await ctx.newPage();
      await p.goto(`/s/${live.data!.token}`);
      await expect(p.locator(".react-flow__node").first()).toBeVisible();
      await scan(p, `shared view (${theme})`);
      await p.goto(`/s/${gone.data!.token}`);
      await scan(p, `expired link (${theme})`);
      await p.goto(`/s/not-a-real-token`);
      await scan(p, `unknown link (${theme})`);
      await ctx.close();
    });

    test("phone: editor, sheet, Quick Add, Simulate and Reports", async ({ browser }) => {
      test.setTimeout(240_000);
      const { id } = await createFunnel({ graph: { ...g, nodes: [...g.nodes, ...WIDGETS] } as typeof g });
      const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/demo.json", viewport: { width: 390, height: 844 } });
      await ctx.addInitScript((t) => localStorage.setItem("fm-theme", t), theme);
      const p = await ctx.newPage();
      await openEditor(p, id);
      await scan(p, `phone editor (${theme})`);
      await node(p, "Quiz funnel").click();
      await scan(p, `phone action bar (${theme})`);
      await p.getByRole("button", { name: "Next step" }).click();
      await expect(p.getByRole("dialog", { name: "Add the next step" })).toBeVisible();
      await p.waitForTimeout(350);
      await scan(p, `phone Quick Add (${theme})`);
      await p.keyboard.press("Escape");
      await p.locator('button.btn.icon[aria-label="More"]').click();
      await p.getByRole("menuitem", { name: "Simulate…" }).click();
      await p.waitForTimeout(500);
      await scan(p, `phone Simulate (${theme})`);
      await p.goto(`/funnels/${id}?view=reports&section=monthly`);
      await p.waitForTimeout(800);
      await scan(p, `phone Reports (${theme})`);
      await ctx.close();
    });
  });
}
