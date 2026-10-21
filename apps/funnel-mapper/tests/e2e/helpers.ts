import { createClient } from "@supabase/supabase-js";
import { expect, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { compute, summary } from "../../lib/funnel-math";
import { blankGraph, blankSettings, type FunnelGraph, type FunnelSettings } from "../../lib/graph";
import { builtinTemplate } from "../../lib/templates";

export function env(k: string) {
  if (process.env[k]) return process.env[k]!;
  for (const f of [".env.local", ".env.example"]) {
    try {
      const m = readFileSync(f, "utf8").match(new RegExp(`^${k}=(.*)$`, "m"));
      if (m) return m[1].trim();
    } catch {}
  }
  throw new Error(`missing ${k}`);
}

export const DEMO_CLIENT = "10000000-0000-4000-8000-000000000001";

/** Creates a funnel for the demo client straight through the API and returns its id. */
export async function createFunnel(opts: { template?: string; graph?: FunnelGraph; name?: string; settings?: Partial<FunnelSettings> } = {}) {
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
  const { error: authErr } = await sb.auth.signInWithPassword({ email: "demo@layer2funnels.test", password: "demo-password" });
  if (authErr) throw authErr;
  const t = opts.template ? builtinTemplate(opts.template) : null;
  const graph = opts.graph ?? t?.graph ?? blankGraph();
  const settings = { ...blankSettings(), ...opts.settings };
  const { data, error } = await sb
    .from("funnels")
    .insert({ client_id: DEMO_CLIENT, name: opts.name ?? `E2E ${t?.name ?? "blank"} ${Date.now()}`, graph, settings, summary: summary(compute(graph, settings)) })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, graph, sb };
}

/** Specs start with the details panel open (see auth.setup). Pass { panel: false } to see the collapsed rail new users get. */
export async function openEditor(page: Page, id: string, opts: { panel?: boolean } = {}) {
  if (opts.panel === false) await page.addInitScript(() => localStorage.removeItem("fm-editor-opts"));
  await page.goto(`/funnels/${id}`);
  await expect(page.locator(".fm-editor")).toBeVisible();
  await expect(page.locator(".fm-saved")).toContainText(/Saved|View only/);
}

export const nodes = (page: Page) => page.locator(".react-flow__node");
export const node = (page: Page, name: string) => page.locator(".react-flow__node", { has: page.locator(".fm-ntitle > span:first-child", { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
export const edgeLabels = (page: Page) => page.locator(".fm-elabel");

/** Flow-space position of a node from React Flow's transform. */
export async function pos(page: Page, id: string) {
  const t = await page.locator(`.react-flow__node[data-id="${id}"]`).evaluate((el) => (el as HTMLElement).style.transform);
  const m = t.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/)!;
  return { x: Number(m[1]), y: Number(m[2]) };
}

export async function waitSaved(page: Page) {
  await expect(page.locator(".fm-saved")).toHaveText(/Saved/, { timeout: 20_000 });
}

/** Drag with real pointer events (React Flow listens to mouse/pointer, not HTML5 DnD). */
export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, opts: { shift?: boolean; steps?: number } = {}) {
  if (opts.shift) await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 5, from.y + 5, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: opts.steps ?? 12 });
  await page.mouse.up();
  if (opts.shift) await page.keyboard.up("Shift");
}

export async function centre(page: Page, selector: string | ReturnType<Page["locator"]>) {
  const loc = typeof selector === "string" ? page.locator(selector) : selector;
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

const MAILPIT = "http://127.0.0.1:54324";

export async function signIn(browser: Browser, email: string, password = "demo-password") {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem("fm-editor-opts", JSON.stringify({ hideInsp: false }))); // specs work in the full details panel
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return { ctx, page };
}

/** Latest email to `to` from the local Mailpit inbox, ignoring anything sent before `since` (ms epoch). */
export async function latestMail(to: string, since = 0) {
  for (let i = 0; i < 30; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const j = (await r.json()) as { messages: { ID: string; Created: string }[] };
    const fresh = (j.messages ?? []).find((m) => Date.parse(m.Created) >= since - 1000);
    if (fresh) {
      const m = await (await fetch(`${MAILPIT}/api/v1/message/${fresh.ID}`)).json();
      return m as { Subject: string; HTML: string };
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  throw new Error(`no email for ${to}`);
}

/** Add a library block through the palette search (annotation blocks sit in a collapsed group). */
export async function addFromPalette(page: Page, label: string) {
  const search = page.getByPlaceholder(/^Search( \d+)? blocks$/);
  await search.fill(label);
  await page.getByRole("button", { name: `Add ${label}`, exact: true }).click();
  await search.fill("");
}

/** Start Simulate on the map: the Simulate group of the Funnel panel (What-if), or the collapsed rail's button. */
export async function startSimulate(page: Page) {
  // the editor decides what is collapsed once it has mounted: wait for it, or the rail check below races the panel opening
  await page.waitForSelector(".react-flow__node, .fm-canvas-empty");
  await page.waitForTimeout(300);
  const rail = page.getByRole("button", { name: "Simulate", exact: true });
  if (await rail.isVisible().catch(() => false)) return rail.click();
  const tab = page.getByRole("tab", { name: "Simulate", exact: true });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    return page.getByRole("button", { name: "Simulate on the map" }).click();
  }
  // a block is selected, so the panel shows its tabs: the S shortcut starts Simulate from the map
  await page.locator(".react-flow__pane").click({ position: { x: 500, y: 420 } });
  await page.keyboard.press("s");
}

/** A block tile in the library: the library shows one category at a time, so search for it first. */
export async function paletteItem(page: Page, label: string) {
  await page.getByPlaceholder(/^Search( \d+)? blocks$/).fill(label);
  return page.getByRole("button", { name: `Add ${label}`, exact: true }).first();
}

const GROUP_OF: Record<string, string> = { Overview: "Model", Steps: "Model", Sources: "Model", Costs: "Model", "What-if": "Simulate", Scenarios: "Simulate", Forecast: "Track", Actuals: "Track" };
/** A tab of the Funnel panel: open its group (Model | Simulate | Track) first, then the tab. */
export async function funnelTab(page: Page, name: keyof typeof GROUP_OF | string) {
  const tab = page.getByRole("tab", { name, exact: true });
  if (!(await tab.isVisible().catch(() => false))) await page.getByRole("tablist", { name: "Funnel tools" }).getByRole("tab", { name: GROUP_OF[name], exact: true }).click();
  await tab.click();
}
