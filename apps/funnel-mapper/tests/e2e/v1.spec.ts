// Final V1 workflows: Reports / Insights, goals, reinvestment, published status, notes, layers, library, roles,
// client archive and logo upload. Uses the seeded local stack (see playwright.config.ts).
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { DEMO_CLIENT, createFunnel, env, node, nodes, openEditor, signIn, waitSaved, funnelTab } from "./helpers";

test.describe("reports / insights", () => {
  test("a first-class Reports view: same numbers as the map, every section, deep links", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(page).toHaveURL(/view=reports&section=overview/);
    const main = page.locator(".fm-rmain");
    await expect(main.getByRole("heading", { name: "Overview" })).toBeVisible();
    // golden quiz funnel (MASTER_HANDOFF §14): the report agrees with the engine and the KPI bar
    await expect(main.locator(".fm-rkpis").first()).toContainText("£6,032");
    await expect(main.locator(".fm-rkpis").first()).toContainText(/Customers\s*89(?!\.\d)/);
    await expect(main.locator(".fm-rkpis").first()).toContainText("13.4x");
    await expect(main).toContainText("Key leak: Quiz funnel");
    for (const name of ["Funnel data", "Traffic sources", "Offers & products", "Expenses", "Scenario comparison", "Revenue & profit forecast", "Goals & required numbers", "MRR forecast", "Month-to-month", "Traffic reinvestment", "Published status"]) {
      await page.locator(".fm-rnav").getByRole("button", { name, exact: true }).click();
      await expect(main.getByRole("heading", { level: 1 })).toHaveText(name);
    }
    // deep link straight to a section
    await page.goto(`/funnels/${id}?view=reports&section=mrr`);
    await expect(page.locator(".fm-rmain h1")).toHaveText("MRR forecast");
    await expect(page.locator(".fm-rmain table")).toContainText("Active subs");
    // back to the map
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator(".fm-reports")).toHaveCount(0);
    await expect(page).not.toHaveURL(/view=reports/);
  });

  test("named goals show required numbers; build status feeds Published status; scenarios compare with differences", async ({ page }) => {
    const { id, sb } = await createFunnel({ template: "quiz" });
    await page.goto(`/funnels/${id}?view=reports&section=goals`);
    const main = page.locator(".fm-rmain");
    await main.getByRole("button", { name: "Add goal", exact: true }).click();
    await main.getByLabel("Name").fill("Dream profit");
    await main.getByLabel("Target").fill("20000");
    await expect(main.getByRole("region", { name: "Goal: Dream profit" })).toContainText("Per month");
    await expect(main.getByRole("region", { name: "Goal: Dream profit" }).locator("table")).toContainText("£20,000");
    await waitSaved(page);
    const saved = await sb.from("funnels").select("settings").eq("id", id).single();
    expect((saved.data!.settings as { goals: { name: string; value: number }[] }).goals).toMatchObject([{ name: "Dream profit", kind: "profit", value: 20000 }]);

    // build status from the Funnel data table
    await page.locator(".fm-rnav").getByRole("button", { name: "Funnel data" }).click();
    await main.getByLabel("Status of Quiz funnel").selectOption("done");
    await page.locator(".fm-rnav").getByRole("button", { name: "Published status" }).click();
    await expect(main.locator(".fm-rkpis").first()).toContainText("1 of 11 steps live");

    // scenarios: presets from the map's Scenarios tab, compared in Reports with deltas
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await funnelTab(page, "Scenarios");
    await page.getByRole("button", { name: "Add conservative and best case", exact: true }).click();
    await page.getByRole("button", { name: "Duplicate Best case" }).click();
    await expect(page.getByLabel("Scenario name").last()).toHaveValue("Best case (copy)");
    await page.getByRole("button", { name: "Reports → Scenario comparison" }).click();
    const table = page.locator(".fm-rmain table");
    await expect(table.locator("thead")).toContainText("Conservative");
    await expect(table.locator("thead")).toContainText("Best case (copy)");
    await expect(table.locator("tbody")).toContainText("Profit");
    await expect(table.locator("small.neg").first()).toBeVisible();
  });

  test("traffic reinvestment grows profit and the scenario picker re-computes every section", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await page.goto(`/funnels/${id}?view=reports&section=reinvest`);
    const main = page.locator(".fm-rmain");
    await expect(main.getByLabel("Reinvest (% of profit)")).toHaveValue("0");
    await main.getByRole("button", { name: "Reinvest 50%" }).click();
    await expect(main.locator("tbody tr").nth(1)).toContainText("£2,791"); // half of month 1's £5,582 profit
    await main.getByLabel("Reinvest (% of profit)").fill("0");
    await expect(main.getByText("Pick how much profit to reinvest")).toBeVisible();
    await page.locator(".fm-rnav").getByRole("button", { name: "Overview" }).click();
    await expect(main).toContainText("Numbers for Baseline (current map)");
  });
});

test.describe("notes, layers, analytics and the library", () => {
  test("rich-text sticky notes, internal funnel notes kept off share links, layers and the element Analytics tab", async ({ page, browser }) => {
    const { id, sb } = await createFunnel({ template: "tripwire" });
    await openEditor(page, id);
    // sticky note: formatting toolbar, rendered as rich text on the canvas
    const sticky = page.locator(".react-flow__node-note").first();
    await sticky.click();
    const area = page.getByLabel("Note", { exact: true });
    await area.fill("## Offer\n- **Bold point**\n- second");
    await expect(sticky.locator("h4")).toHaveText("Offer");
    await expect(sticky.locator("strong")).toHaveText("Bold point");
    // funnel notes: internal by default
    await page.getByRole("button", { name: "Funnel notes" }).click();
    await page.locator(".fm-insp").getByLabel("Notes", { exact: true }).fill("INTERNAL STRATEGY: raise prices");
    await waitSaved(page);
    const link = await sb.from("share_links").insert({ funnel_id: id }).select("token").single();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const c = await ctx.newPage();
    await c.goto(`/s/${link.data!.token}`);
    await expect(c.locator(".react-flow__node").first()).toBeVisible();
    expect(await c.content()).not.toContain("INTERNAL STRATEGY");
    await expect(c.getByRole("button", { name: "Funnel notes" })).toHaveCount(0);
    // share them on purpose → the client can read them
    await page.getByLabel("Show these notes on client share links").check();
    await waitSaved(page);
    await c.reload();
    await c.getByRole("button", { name: "Funnel notes" }).click();
    await expect(c.locator(".fm-insp")).toContainText("INTERNAL STRATEGY: raise prices");
    await ctx.close();

    // layers: hide notes, clean map
    await page.getByRole("button", { name: "Funnel menu" }).click();
    await page.locator(".menu-pop").getByLabel("Notes", { exact: true }).uncheck();
    await expect(page.locator(".react-flow__node-note")).toBeHidden();
    await page.getByRole("menuitemcheckbox", { name: "Clean", exact: true }).click();
    await expect(page.locator(".fm-editor")).toHaveClass(/fm-hide-nums/);
    await page.getByRole("menuitemcheckbox", { name: "People", exact: true }).click();
    await page.keyboard.press("Escape");
    // the calendar sets the dates the numbers cover: this year = twelve months of the plan
    await page.getByRole("button", { name: /^Dates:/ }).click();
    await page.getByRole("button", { name: "This year" }).click();
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.locator(".fm-kpis")).toContainText(/per year|\/ yr/);

    // element Analytics tab: numbers, a conversion goal and a per-period forecast
    await node(page, "Fitness quiz").click();
    await page.getByRole("tab", { name: "Analytics" }).click();
    await expect(page.locator(".fm-insp")).toContainText("People in");
    await page.getByLabel("Target conversion (%)").fill("60");
    await expect(page.locator(".fm-insp")).toContainText("Revenue at target");
    await expect(page.locator(".fm-insp table")).toContainText("Year");
  });

  test("library: groups, search across 160+ blocks, favourites and recents; new blocks reuse the maths", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    const side = page.locator(".fm-side");
    await expect(side.locator("button.fm-sb-ah", { hasText: "Communication" })).toBeVisible(); // V2: one category open at a time
    await expect(side.locator("button.fm-sb-ah", { hasText: "Sales & CRM" })).toBeVisible();
    await side.getByPlaceholder(/Search( \d+)? blocks/).fill("membership");
    await side.getByRole("button", { name: "Add Membership", exact: true }).click();
    await expect(nodes(page)).toHaveCount(1);
    await expect(page.locator(".fm-insp")).toContainText("Billing"); // subscription fields
    await side.getByPlaceholder(/Search( \d+)? blocks/).fill("");
    await expect(side.getByRole("button", { name: "Recent: Membership" })).toBeVisible();
    await side.getByPlaceholder(/Search( \d+)? blocks/).fill("Rectangle");
    await side.getByRole("button", { name: "Add Rectangle", exact: true }).first().hover();
    await side.getByRole("button", { name: "Favourite Rectangle" }).click();
    await side.getByPlaceholder(/Search( \d+)? blocks/).fill("");
    await side.getByRole("button", { name: "Favourite: Rectangle" }).click();
    await expect(page.locator(".fm-shape")).toHaveCount(1);
    await side.getByPlaceholder(/Search( \d+)? blocks/).fill("Link card");
    await side.getByRole("button", { name: "Add Link card", exact: true }).first().click();
    await page.getByLabel("Link (page, video or file)").fill("https://youtu.be/dQw4w9WgXcQ");
    await page.getByLabel("Title").fill("Sales video");
    await expect(page.locator(".fm-node.linkcard")).toContainText("Sales video");
    await expect(page.locator(".fm-node.linkcard .lthumb.video")).toBeVisible();
    // floating quick-add: double-click empty canvas, search, Enter adds at that spot; "/" opens it too
    const before = await nodes(page).count();
    await page.locator(".react-flow__pane").dblclick({ position: { x: 120, y: 420 } });
    await page.getByLabel("Search blocks to add").fill("upsell");
    await page.keyboard.press("Enter");
    await expect(nodes(page)).toHaveCount(before + 1);
    await expect(page.getByRole("dialog", { name: "Quick add a block" })).toHaveCount(0);
    // "/" jumps to the Blocks sidebar search (V2)
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 400 } });
    await page.keyboard.press("/");
    await expect(side.getByPlaceholder(/Search( \d+)? blocks/)).toBeFocused();
  });
});

test.describe("roles and clients", () => {
  test("a viewer sees everything and can change nothing", async ({ browser }) => {
    const { page, ctx } = await signIn(browser, "viewer@layer2funnels.test");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("link", { name: "New client" })).toHaveCount(0);
    await page.goto(`/clients/${DEMO_CLIENT}`);
    await expect(page.getByRole("heading", { name: /Sam Carter/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "New funnel" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.getByRole("button", { name: "Save details" })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Move client to Trash/ })).toHaveCount(0);
    // the editor is view-only: no share, no editing, but reports and analytics work
    await page.goto("/funnels/20000000-0000-4000-8000-000000000002");
    await expect(page.locator(".fm-saved")).toHaveText("View only");
    await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit this funnel" })).toHaveCount(0);
    await expect(page.getByLabel("Funnel name")).toHaveAttribute("readonly", "");
    await page.locator(".react-flow__node", { hasText: "Quiz funnel" }).first().click();
    await page.getByRole("tab", { name: "Analytics" }).click();
    await expect(page.locator(".fm-insp")).toContainText("People in");
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(page.locator(".fm-rkpis").first()).toContainText("£6,032");
    await page.goto("/settings#team");
    await expect(page.locator("main")).toContainText("Viewer");
    await expect(page.getByRole("heading", { name: "Invite a teammate" })).toHaveCount(0);
    await ctx.close();
  });

  test("the owner assigns roles; an invite can start as a viewer", async ({ page }) => {
    await page.goto("/settings#team");
    const row = page.getByRole("listitem").filter({ hasText: "teammate@layer2funnels.test" });
    await expect(row.getByLabel("Role for teammate@layer2funnels.test")).toHaveValue("editor");
    await expect(page.getByRole("listitem").filter({ hasText: "demo@layer2funnels.test" })).toContainText("Owner");
    await expect(page.getByLabel("Role", { exact: true })).toHaveValue("editor");
    await page.goto("/settings#independent");
    await expect(page.getByRole("heading", { name: "Independent accounts" })).toBeVisible(); // owner only
  });

  test("archive and restore a client; upload, show and remove a client logo", async ({ page }) => {
    const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    await sb.auth.signInWithPassword({ email: "demo@layer2funnels.test", password: "demo-password" });
    const name = `Archive me ${Date.now()}`;
    const { data } = await sb.from("clients").insert({ name, owner_id: (await sb.auth.getUser()).data.user!.id }).select("id").single();
    await page.goto(`/clients/${data!.id}?tab=details`);
    // logo upload (P0: upload, preview, persist)
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Upload logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(page.getByRole("button", { name: "Change logo" })).toBeVisible();
    await expect.poll(async () => (await sb.from("clients").select("logo_url").eq("id", data!.id).single()).data?.logo_url).toMatch(/\/logos\//);
    await page.reload();
    await expect(page.getByRole("img", { name: `${name} logo` })).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Upload logo" })).toBeVisible();

    await page.getByRole("button", { name: "Archive client" }).click();
    await expect(page.getByRole("button", { name: "Restore client" })).toBeVisible();
    await page.goto("/clients");
    await expect(page.getByText(name)).toHaveCount(0);
    await page.getByRole("button", { name: /^Archived/ }).click();
    await expect(page.getByText(name).first()).toBeVisible();
    await page.goto(`/clients/${data!.id}`);
    await page.getByRole("button", { name: "Restore client" }).click();
    await expect(page.getByRole("button", { name: "Archive client" })).toBeVisible();
    await sb.from("clients").delete().eq("id", data!.id);
  });
});
