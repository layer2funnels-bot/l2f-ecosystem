import { expect, test, type Page } from "@playwright/test";
import { builtinTemplate } from "../../lib/templates";
import { createFunnel, node, openEditor } from "./helpers";

// Touch targets on a tablet and a phone: buttons, tabs, menu rows and fields are at least 40px in both directions
// (the spec says 40-44). Small inline links (a caption under a number, a name in a table) keep their look and get a larger hit
// area instead; the React Flow credit is third-party and fixed by its licence.
async function offenders(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'button, a.btn, input:not([type=hidden]):not([type=range]):not([type=checkbox]):not([type=radio]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=option], summary';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      if (el.closest(".react-flow__minimap, .react-flow__node, .react-flow__edge, .fm-elabel, .react-flow__handle, [aria-hidden=true], [inert]")) continue;
      if (el.classList.contains("link") || el.closest(".fm-rkpis small, .fm-health-pill, .fm-funnels td")) continue; // inline links: larger hit area
      if (el.closest(".fm-chips, .fm-quick-cats, .fm-cats")) continue; // chips in a scrolling row are 36px by design
      if (r.height < 39.5 || r.width < 39.5) out.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 28)} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 22)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

for (const [w, h] of [[390, 844], [430, 932], [768, 1024]] as const) {
  test(`${w}px: interactive controls are at least 40px`, async ({ browser }) => {
    test.setTimeout(240_000);
    const g = builtinTemplate("quiz").graph;
    const { id } = await createFunnel({ graph: g });
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/demo.json", viewport: { width: w, height: h }, hasTouch: true });
    const p = await ctx.newPage();
    const seen: Record<string, string[]> = {};
    const sweep = async (label: string) => {
      const o = (await offenders(p)).filter((x) => !x.includes("React Flow attribution"));
      if (o.length) seen[label] = o;
    };
    await openEditor(p, id);
    await sweep("editor");
    await node(p, "Quiz funnel").click();
    await p.waitForTimeout(400);
    await sweep("selected block");
    for (const u of ["/", "/clients", "/funnels", "/templates", "/settings", `/funnels/${id}?view=reports&section=overview`, `/funnels/${id}?view=reports&section=monthly`]) {
      await p.goto(u);
      await p.waitForTimeout(800);
      await sweep(u.slice(0, 40));
    }
    await ctx.close();
    expect(seen, JSON.stringify(seen, null, 1)).toEqual({});
  });
}
