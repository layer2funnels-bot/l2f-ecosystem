import { expect, test } from "@playwright/test";
import { builtinTemplate } from "../../lib/templates";
import { DEMO_CLIENT, createFunnel } from "./helpers";

// "No horizontal PAGE scrolling" at every supported width: only tables, KPI chip rows and the canvas may scroll sideways inside themselves.
const WIDTHS = [
  [1536, 960],
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [430, 932],
  [414, 896],
  [390, 844],
] as const;

test("no page scrolls sideways at 1536, 1440, 1280, 1024, 768, 430, 414 or 390", async ({ browser }) => {
  test.setTimeout(420_000);
  const g = builtinTemplate("quiz").graph;
  const widget = { id: "wa", type: "widget", name: "Widget", x: 0, y: -330, p: { scope: "funnel", display: "number", metrics: ["revenue", "profit", "roas", "cpa"], wsize: "L" } };
  const { id, sb } = await createFunnel({ graph: { ...g, nodes: [...g.nodes, widget] } as typeof g });
  const link = await sb.from("share_links").insert({ funnel_id: id, allow_comments: true }).select("token").single();
  const pages = ["/", "/clients", `/clients/${DEMO_CLIENT}`, "/funnels", "/templates", "/settings", `/funnels/${id}`, `/funnels/${id}?view=reports&section=overview`, `/funnels/${id}?view=reports&section=data`, `/funnels/${id}?view=reports&section=monthly`, `/funnels/${id}?view=reports&section=mrr`, `/s/${link.data!.token}`];
  const wide: string[] = [];
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/demo.json", viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    for (const u of pages) {
      await p.goto(u);
      await p.waitForTimeout(700);
      const over = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth - innerWidth, body: document.body.scrollWidth - innerWidth }));
      if (over.doc > 1 || over.body > 1) wide.push(`${w}px ${u.replace(/[0-9a-f-]{36}/g, ":id").slice(0, 50)} +${Math.max(over.doc, over.body)}px`);
    }
    await ctx.close();
  }
  expect(wide).toEqual([]);
});
