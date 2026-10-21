import { expect, test } from "@playwright/test";
import { createFunnel, node, nodes, openEditor, waitSaved, funnelTab, paletteItem } from "./helpers";

const WEBINAR_LIVE = "20000000-0000-4000-8000-000000000003"; // seeded, has last month's actuals

test.describe("autosave and offline (M4)", () => {
  test("edits made offline are kept on this device and sync when back online", async ({ page, context }) => {
    const { id } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    await context.setOffline(true);
    await node(page, "Live webinar").click();
    await page.getByLabel("Name", { exact: true }).fill("Offline webinar");
    await expect(page.locator(".fm-saved")).toContainText("Offline · kept on this device", { timeout: 15_000 });
    await expect(page.locator(".fm-offline")).toContainText("Changes are kept on this device and will save when you’re back");
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitSaved(page);
    await expect(page.locator(".fm-offline")).toHaveCount(0);
    await page.reload();
    await expect(node(page, "Offline webinar")).toBeVisible();
  });

  test("a local draft is recovered after closing the tab while offline", async ({ page, context }) => {
    const { id } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    await context.setOffline(true);
    await node(page, "Live webinar").click();
    await page.getByLabel("Name", { exact: true }).fill("Recovered webinar");
    await expect(page.locator(".fm-saved")).toContainText("Offline", { timeout: 15_000 });
    await page.close({ runBeforeUnload: false });
    await context.setOffline(false);
    const again = await context.newPage();
    await again.goto(`/funnels/${id}`);
    await expect(again.locator(".fm-toast")).toContainText("Restored unsaved changes");
    await expect(node(again, "Recovered webinar")).toBeVisible();
    await waitSaved(again);
    await again.reload();
    await expect(node(again, "Recovered webinar")).toBeVisible();
  });
});

test.describe("modals", () => {
  /** Centre of the open dialog relative to the viewport centre, and whether it fits on screen. */
  async function placement(page: import("@playwright/test").Page) {
    const vp = page.viewportSize()!;
    const b = (await page.locator("dialog[open]").boundingBox())!;
    return { dx: Math.abs(b.x + b.width / 2 - vp.width / 2), dy: Math.abs(b.y + b.height / 2 - vp.height / 2), fits: b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height };
  }

  test("dialogs open centred and inside the viewport (desktop and phone)", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /^Share with/ })).toBeVisible();
    let p = await placement(page);
    expect(p.dx).toBeLessThanOrEqual(2);
    expect(p.dy).toBeLessThanOrEqual(2);
    expect(p.fits).toBe(true);
    await page.keyboard.press("Escape");

    for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 640 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await page.getByRole("button", { name: "New funnel" }).first().click();
      await expect(page.locator("dialog[open]")).toBeVisible();
      p = await placement(page);
      expect(p.dx, `${size.width}px horizontal`).toBeLessThanOrEqual(2);
      expect(p.fits, `${size.width}px fits`).toBe(true);
      await page.keyboard.press("Escape");
      await expect(page.locator("dialog[open]")).toHaveCount(0);
    }
  });
});

test.describe("share links (M5)", () => {
  async function makeLink(page: import("@playwright/test").Page, id: string, opts: { edit?: boolean; hide?: boolean } = {}) {
    await openEditor(page, id);
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dlg = page.getByRole("dialog", { name: /^Share with/ });
    if (opts.edit) await dlg.getByRole("group", { name: "Permission" }).getByRole("button", { name: "Edit", exact: true }).click();
    if (opts.hide) await dlg.getByLabel("Show numbers").uncheck();
    await dlg.getByRole("button", { name: "Create link" }).click();
    const link = await dlg.getByRole("textbox", { name: "Share link" }).first().inputValue();
    await dlg.getByRole("button", { name: "Done", exact: true }).click();
    return link;
  }

  test("edit links let the client change the map; internal notes stay internal", async ({ page, browser }) => {
    const { id, sb } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    await node(page, "Live webinar").click();
    await page.getByRole("tab", { name: "Plan" }).click();
    await page.getByLabel("Internal notes").fill("SECRET: margin is thin");
    await waitSaved(page);
    const link = await makeLink(page, id, { edit: true });
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const c = await ctx.newPage();
    await c.goto(link);
    await expect(c.locator(".react-flow__node")).toHaveCount(9);
    expect(await c.content()).not.toContain("SECRET");
    await (await paletteItem(c, "Thank-you page")).click();
    await expect(c.locator(".react-flow__node")).toHaveCount(10);
    await expect(c.locator(".fm-saved")).toHaveText(/Saved/, { timeout: 20_000 });
    await ctx.close();
    await page.reload();
    await expect(nodes(page)).toHaveCount(10);
    // the client's save kept the internal note (checked in the stored funnel: the client's new block can land
    // anywhere on screen, possibly on top of "Live webinar", so clicking it isn't a reliable check)
    const { data } = await sb.from("funnels").select("graph").eq("id", id).single();
    const stored = (data!.graph as { nodes: { name: string; desc?: string }[] }).nodes;
    expect(stored).toHaveLength(10);
    expect(stored.find((n) => n.name === "Live webinar")?.desc).toBe("SECRET: margin is thin");
  });

  test("hide-numbers links show only the journey", async ({ page, browser }) => {
    const { id } = await createFunnel({ template: "webinar" });
    const link = await makeLink(page, id, { hide: true, edit: true });
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const c = await ctx.newPage();
    await c.goto(link);
    await expect(c.locator(".react-flow__node")).toHaveCount(9);
    await expect(c.locator(".fm-kpis")).toHaveCount(0);
    await expect(c.locator(".fm-bchip").first()).toBeHidden();
    // the hide-numbers client view is the map alone: no panel, no numbers
    // can't edit when numbers are hidden, even if the link was created as editable
    await expect(c.getByPlaceholder(/^Search( \d+)? blocks$/)).toHaveCount(0);
    await expect(c.getByRole("button", { name: "Add Landing page", exact: true })).toHaveCount(0);
    expect(await c.locator("body").innerText()).not.toMatch(/£\s?\d/); // no money anywhere on screen
    await ctx.close();
  });

  test("client comments reach the team", async ({ page, browser }) => {
    const { id } = await createFunnel({ template: "webinar" });
    const link = await makeLink(page, id);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const c = await ctx.newPage();
    await c.goto(link);
    await c.locator(".react-flow__node", { hasText: "Live webinar" }).click();
    await c.getByLabel("Your name").fill("Priya");
    await c.getByLabel(/Comment on “Live webinar”/).fill("Can we run this on Thursdays?");
    await c.getByRole("button", { name: "Post comment" }).click();
    await expect(c.getByText("Can we run this on Thursdays?")).toBeVisible();
    await ctx.close();
    await page.reload();
    await page.getByRole("button", { name: /Client comments/ }).click();
    await expect(page.getByText("Can we run this on Thursdays?")).toBeVisible();
    await expect(page.getByRole("button", { name: "On “Live webinar”" })).toBeVisible();
    await page.getByRole("button", { name: "Resolve" }).click();
    await expect(page.getByText("No comments to resolve.")).toBeVisible();
  });
});

test.describe("reports and planning tools", () => {
  test("costs, scenarios, forecast and goal seek", async ({ page }) => {
    const { id } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    const profit = async () => (await page.locator(".fm-kpis .fm-kpi", { hasText: "Profit" }).locator("b").textContent())!;
    const before = await profit();
    // costs
    await funnelTab(page, "Costs");
    await page.getByRole("button", { name: "Add expense", exact: true }).click();
    await page.getByLabel("Expense name").fill("Funnel software");
    await page.getByLabel("Amount").fill("300");
    await expect.poll(profit).not.toBe(before);
    await page.getByRole("button", { name: "Add expense", exact: true }).click();
    await page.getByLabel("Expense name").nth(1).fill("Build");
    await page.getByLabel("Amount").nth(1).fill("5000");
    await page.getByLabel("How often").nth(1).selectOption("one_time");
    await expect(page.locator(".statbox", { hasText: "Payback" })).toContainText("periods");
    // scenarios
    await funnelTab(page, "Scenarios");
    await page.getByRole("button", { name: "Add conservative and best case", exact: true }).click();
    const table = page.getByRole("table", { name: "Scenario comparison" });
    await expect(table.getByRole("columnheader")).toHaveCount(4);
    await expect(table.getByRole("row", { name: /Profit/ })).toBeVisible();
    // forecast
    await funnelTab(page, "Forecast");
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    await page.getByLabel("Months").fill("6");
    await page.getByRole("button", { name: "Show table" }).click();
    await expect(page.locator("#rbody table tbody tr")).toHaveCount(6);
    // what-if + goal seek
    await funnelTab(page, "What-if");
    await page.getByRole("spinbutton", { name: "Of", exact: true }).fill("50000");
    await expect(page.locator(".statbox", { hasText: "Multiplier needed" })).toBeVisible();
    await page.getByRole("button", { name: "Apply to what-if" }).click();
    await expect.poll(profit).toContain("50,000"); // the strip has the profit; the funnel panel no longer repeats it
  });

  test("presentation mode walks through the funnel", async ({ page }) => {
    const { id } = await createFunnel({ template: "call" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Funnel menu" }).click();
    await page.getByRole("menuitem", { name: "Present" }).click();
    const card = page.getByRole("region", { name: "Presentation" });
    await expect(card).toContainText("Overview");
    await card.getByRole("button", { name: "Next stage" }).click();
    await expect(card).toContainText("Stage 1 of 3");
    await expect(card.getByRole("heading", { name: "Acquire" })).toBeVisible();
    await expect(card).toContainText("visits");
    await page.keyboard.press("ArrowRight");
    await expect(card).toContainText("Stage 2 of 3");
    await expect(card.getByRole("heading", { name: "Convert" })).toBeVisible();
    // Clean hides the numbers, Numbers brings them back
    await card.getByRole("button", { name: "Clean" }).click();
    await expect(card).not.toContainText("customers ·");
    await card.getByRole("button", { name: "Numbers" }).click();
    await expect(card).toContainText("customers");
    await page.keyboard.press("Escape");
    await expect(page.locator(".fm-top")).toBeVisible();
  });

  test("client products appear in the palette, ready to drop in", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await page.getByRole("button", { name: "Add 6-Week Kickstart", exact: true }).click();
    await expect(nodes(page)).toHaveCount(1);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("6-Week Kickstart");
    await expect(page.getByLabel("Price (£)")).toHaveValue("37");
    await expect(page.getByLabel("Buy rate (%)")).toHaveValue("8");
  });

  test("planned vs actual", async ({ page }) => {
    await openEditor(page, WEBINAR_LIVE);
    await funnelTab(page, "Actuals");
    await expect(page.locator(".statbox", { hasText: "Revenue actual" })).not.toContainText("–");
    await expect.poll(() => page.getByRole("table", { name: "Planned vs actual by step" }).getByRole("row").count()).toBeGreaterThanOrEqual(10);
    await page.getByRole("button", { name: "Enter actuals for this range" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Facebook ads visitors").fill("2000");
    await dlg.getByRole("button", { name: "Save actuals" }).click();
    await expect(dlg).toBeHidden();
    await expect(page.getByRole("table", { name: "Planned vs actual by step" }).getByRole("row", { name: /Facebook ads/ })).toContainText("2,000");
  });
});

test.describe("portfolio", () => {
  test("dashboard totals and client filters", async ({ page }) => {
    await page.goto("/");
    const totals = page.getByRole("region", { name: "Totals" });
    await expect(totals).toContainText("Active clients");
    await expect(totals).toContainText("Live funnels");
    await expect(totals).toContainText("Planned revenue");
    await expect(totals).toContainText("£");
    await page.goto("/clients");
    await expect(page.getByRole("table")).toBeVisible(); // V2: the table is the default view
    await page.getByRole("button", { name: "Card view" }).click();
    await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: /^Proposal/ }).click();
    await expect(page.getByRole("list", { name: "Clients" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("group", { name: "Filter by status" }).getByRole("button", { name: /^All/ }).click();
    await page.getByLabel("Search clients").fill("calm mind");
    await expect(page.getByRole("list", { name: "Clients" }).getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Table view" }).click();
    await expect(page.getByRole("table")).toContainText("Priya Nair");
  });

  test("client details, notes and products", async ({ page }) => {
    const stamp = Date.now();
    await page.goto("/clients/10000000-0000-4000-8000-000000000004");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Notes" }).click();
    await page.getByRole("textbox", { name: "Notes", exact: true }).fill(`Prefers WhatsApp ${stamp}`);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: /Products/ }).click();
    await page.getByRole("button", { name: "Add product", exact: true }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Name").fill(`Glow membership ${stamp}`);
    await dlg.getByLabel("Offer type").selectOption("sub");
    await dlg.getByLabel("Price per period").fill("39");
    await dlg.getByRole("button", { name: "Save product" }).click();
    await expect(page.getByRole("cell", { name: `Glow membership ${stamp}`, exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Phone").fill("+971 50 111 2222");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).last()).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(`Prefers WhatsApp ${stamp}`);
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.getByLabel("Phone")).toHaveValue("+971 50 111 2222");
  });

  test("client pricing model: existing retainers, switching models, dynamic fields", async ({ page }) => {
    // an existing (pre-pricing-model) retainer client still reads as a retainer
    await page.goto("/clients/10000000-0000-4000-8000-000000000001");
    await expect(page.getByText("£1,500/month retainer")).toBeVisible();
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.getByLabel("Pricing model")).toHaveValue("retainer");
    await expect(page.getByLabel("Monthly retainer")).toHaveValue("1500");

    const name = `Pricing client ${Date.now()}`;
    await page.goto("/clients/new");
    await page.getByLabel("Client name *").fill(name);
    await page.getByLabel("Pricing model").selectOption("hourly");
    await expect(page.getByLabel("Monthly retainer")).toHaveCount(0);
    await page.getByLabel("Hourly rate").fill("80");
    await page.getByLabel("Estimated hours per month").fill("10");
    await page.getByRole("button", { name: "Create client" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    await expect(page.getByText("£80.00/hour · ~10 h/month")).toBeVisible();

    await page.getByRole("tab", { name: "Details" }).click();
    await page.getByLabel("Pricing model").selectOption("fixed");
    await page.getByLabel("Project fee").fill("5000");
    await page.getByLabel("Project start").fill("2026-01-05");
    await page.getByLabel("Project end").fill("2026-03-31");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).last()).toBeVisible();
    await page.reload();
    await expect(page.getByText("£5,000 fixed project (5 Jan 2026 – 31 Mar 2026)")).toBeVisible();
    await expect(page.getByLabel("Project fee")).toHaveValue("5000");

    // end before start is rejected, and nothing changes
    await page.getByLabel("Project end").fill("2025-12-01");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "end date is before its start" })).toBeVisible();

    // switching back to a retainer starts from a clean slate (the old project fee no longer counts)
    await page.reload();
    await page.getByLabel("Pricing model").selectOption("retainer");
    await page.getByLabel("Monthly retainer").fill("900");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" }).last()).toBeVisible();
    await page.reload();
    await expect(page.getByText("£900/month retainer")).toBeVisible();
    await expect(page.getByText(/£5,000 fixed project/)).toHaveCount(0);
  });
});