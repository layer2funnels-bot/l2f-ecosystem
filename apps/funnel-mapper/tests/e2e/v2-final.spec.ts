// Funnel Mapper Pro V2 final features, through the real UI.
import { expect, test } from "@playwright/test";
import { centre, createFunnel, node, openEditor, waitSaved, funnelTab } from "./helpers";
import { blankGraph } from "../../lib/graph";

test.describe("four ports and line meanings", () => {
  test("ports are hidden at rest, a line can leave any side, and its meaning is chosen on the line", async ({ page }) => {
    const graph = {
      ...blankGraph(),
      nodes: [
        { id: "a", type: "landing", name: "Landing", x: 100, y: 300, p: { cr: 30, lead: false } },
        { id: "b", type: "thanks", name: "Thanks", x: 520, y: 80, p: { cr: 100, lead: false } },
      ],
      edges: [],
      view: { x: 40, y: 0, k: 1 },
    };
    const { id, sb } = await createFunnel({ graph });
    await openEditor(page, id);
    const a = node(page, "Landing");
    const top = a.locator(".fm-port.side.top");
    // calm map: ports are invisible until the block is hovered
    await page.mouse.move(5, 5);
    await expect(top).toHaveCSS("opacity", "0");
    await a.hover();
    await expect(top).toHaveCSS("opacity", "1");
    const from = await centre(page, top);
    const to = await centre(page, node(page, "Thanks"));
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, from.y - 30, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 14 });
    await page.mouse.up();
    const menu = page.getByRole("radiogroup", { name: "Connect as" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("radio", { name: "Yes: people who continue" })).toHaveAttribute("aria-checked", "true");
    await menu.getByRole("radio", { name: "No: people who leave" }).click();
    await expect(menu).toBeHidden();
    await waitSaved(page);
    const { data } = await sb.from("funnels").select("graph").eq("id", id).single();
    const e = (data!.graph as { edges: { from: string; to: string; port: string; sh?: string }[] }).edges[0];
    expect(e).toMatchObject({ from: "a", to: "b", port: "alt", sh: "top" });
    // the meaning can be changed later on the selected line
    await page.locator(".fm-elabel").first().click();
    await page.getByRole("radiogroup", { name: "This line means" }).getByRole("radio", { name: "Skip step" }).click();
    await waitSaved(page);
    const { data: d2 } = await sb.from("funnels").select("graph").eq("id", id).single();
    expect((d2!.graph as { edges: { port: string; s?: { kind?: string } }[] }).edges[0]).toMatchObject({ port: "main", s: { kind: "skip" } });
  });
});

test.describe("trash", () => {
  test("a funnel moves to Trash with a plain question and comes back; a client asks for its name first", async ({ page }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const { env } = await import("./helpers");
    const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });
    await sb.auth.signInWithPassword({ email: "demo@layer2funnels.test", password: "demo-password" });
    const uid = (await sb.auth.getUser()).data.user!.id;
    const name = `Trash client ${Date.now()}`;
    const { data: c } = await sb.from("clients").insert({ name, owner_id: uid }).select("id").single();
    const fname = `Trash funnel ${Date.now()}`;
    await sb.from("funnels").insert({ client_id: c!.id, name: fname, graph: blankGraph(), settings: {} });

    await page.goto(`/clients/${c!.id}`);
    await page.getByRole("button", { name: `Actions for ${fname}` }).click();
    await page.getByRole("menuitem", { name: /Move to Trash/ }).click();
    const dlg = page.getByRole("dialog", { name: "Move to Trash?" });
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Move to Trash" }).click();
    await expect(page.getByRole("button", { name: `Actions for ${fname}` })).toHaveCount(0);

    await page.goto("/trash");
    const row = page.getByRole("row", { name: new RegExp(fname) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Restore ${fname}` }).click();
    await expect(page.getByRole("status")).toContainText("restored");

    // the client: the button only turns on once its name is typed; its funnels go with it
    await page.goto(`/clients/${c!.id}?tab=details`);
    await page.getByRole("button", { name: "Move client to Trash" }).click();
    const cd = page.getByRole("dialog", { name: "Move this client to Trash?" });
    const go = cd.getByRole("button", { name: "Move to Trash" });
    await expect(go).toBeDisabled();
    await cd.getByLabel(`Type ${name} to confirm`).fill(name);
    await expect(go).toBeEnabled();
    await go.click();
    await expect(page).toHaveURL(/\/clients\?trashed=1/);
    await page.goto("/trash");
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("with 1 funnel");
    // delete forever asks once more and says it can't be undone
    await page.getByRole("button", { name: `Delete ${name} forever` }).click();
    const df = page.getByRole("dialog", { name: "Delete forever?" });
    await expect(df).toContainText("cannot be undone");
    await df.getByRole("button", { name: "Delete forever" }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0);
  });
});

test.describe("templates", () => {
  test("the Templates page lists the 13 approved templates with live previews and creates a funnel from the customize form", async ({ page }) => {
    await page.goto("/templates");
    for (const name of ["Lead Squeeze", "Survey", "Summit", "Free Challenge Funnel", "Book Funnel", "Cart Funnel", "Paid Challenge Funnel", "Video Sales Letter Funnel", "Webinar Funnel", "Product Launch Funnel", "Application Funnel", "Webinar Application Funnel", "Mini Class Funnel"])
      await expect(page.getByRole("button", { name: `Preview ${name}`, exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: /^Map of Webinar Funnel: 15 blocks/ }).first()).toBeVisible(); // 14 + the example source
    await page.getByRole("button", { name: "Preview Webinar Application Funnel", exact: true }).click();
    await page.getByRole("complementary", { name: "Preview: Webinar Application Funnel" }).getByRole("button", { name: "Use template" }).click();
    const dlg = page.getByRole("dialog", { name: "Customize Webinar Application Funnel" });
    await expect(dlg).toBeVisible();
    await dlg.getByLabel("Funnel name (optional)").fill("Masterclass application");
    await dlg.getByLabel("Name for Web Class").fill("Free masterclass");
    await dlg.getByLabel("Start with empty numbers").check();
    await dlg.getByRole("button", { name: "Create funnel" }).click();
    await expect(page).toHaveURL(/\/funnels\/[0-9a-f-]{36}$/);
    await expect(page.locator(".react-flow__node", { hasText: "Free masterclass" })).toBeVisible();
    await expect(page.locator(".react-flow__node-block")).toHaveCount(5); // empty numbers: no example source
  });

  test("a template added inside the map lands as one frame and one undo step", async ({ page }) => {
    const graph = { ...blankGraph(), nodes: [{ id: "x", type: "landing", name: "Existing page", x: 300, y: 200, p: { cr: 30, lead: false } }], edges: [] };
    const { id } = await createFunnel({ graph });
    await openEditor(page, id);
    const before = await page.locator('.react-flow__node[data-id="x"]').boundingBox();
    await page.getByRole("button", { name: "Templates", exact: true }).click();
    await page.getByRole("button", { name: /^5\. Book Funnel, 6 blocks/ }).click();
    const dlg = page.getByRole("dialog", { name: "Add Book Funnel to this map" });
    await dlg.getByRole("button", { name: "Add to map" }).click();
    await expect(page.locator(".react-flow__node-frame", { hasText: "Book Funnel" })).toBeVisible();
    await expect(page.locator(".react-flow__node-block")).toHaveCount(1 + 6 + 1);
    // nothing already on the map moved
    await page.keyboard.press("Escape");
    const node0 = page.locator('.react-flow__node[data-id="x"]');
    expect(await node0.evaluate((el) => (el as HTMLElement).style.transform)).toContain("translate(300px, 200px)");
    void before;
    // one undo removes the whole template
    await page.keyboard.press("Control+z");
    await expect(page.locator(".react-flow__node-block")).toHaveCount(1);
    await expect(page.locator(".react-flow__node-frame")).toHaveCount(0);
  });
});

test.describe("actuals", () => {
  test("typed and CSV actuals land in the same place, bad rows are reported, and Actual mode draws them on the map", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await funnelTab(page, "Actuals");
    await page.getByRole("button", { name: "Type in or import CSV" }).click();
    const dlg = page.getByRole("dialog", { name: "Actuals" });
    await expect(dlg.getByRole("tab", { name: "Type it in" })).toHaveAttribute("aria-selected", "true");
    // type one value in the grid (this month, people arriving at the quiz)
    const cell = dlg.getByRole("textbox", { name: /^Quiz funnel, .*People arriving$/ }).last();
    await cell.fill("1500");
    await expect(dlg.getByRole("status")).toHaveText("Saved");
    // CSV: one good row, one row for a step that isn't on the map
    await dlg.getByRole("tab", { name: "Import CSV" }).click();
    const month = new Date().toISOString().slice(0, 7);
    const csv = `Month,Step,People arriving,People continuing,Revenue\n${month},Quiz funnel,1500,600,\n${month},Not a step,1,1,\n`;
    await dlg.getByLabel("Choose CSV file").setInputFiles({ name: "sept.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(dlg.getByText("1 row ready, 1 needs attention")).toBeVisible();
    await expect(dlg.getByText("Row 3: there is no step called “Not a step” on this map.")).toBeVisible();
    await dlg.getByRole("button", { name: "Import 1 row" }).click();
    await expect(dlg.getByText(/1 value set imported from sept\.csv\. 1 row was not imported/)).toBeVisible();
    await dlg.getByRole("button", { name: "Done" }).click();
    // Actual mode: the map shows the recorded people, with a dated badge and an Actual tag on the strip
    await page.getByRole("group", { name: "Plan or actual numbers" }).getByRole("button", { name: "Actual" }).click();
    await expect(page.locator(".fm-before-badge.actual")).toContainText("Actual");
    await expect(page.locator(".fm-kunit")).toContainText("Actual");
    await expect(node(page, "Quiz funnel")).toContainText("1,500");
    await page.getByRole("group", { name: "Plan or actual numbers" }).getByRole("button", { name: "Actual" }).click(); // the same switch turns it off
    await expect(page.locator(".fm-kunit")).toContainText("Plan");
  });
});

test.describe("panels and simulate", () => {
  test("[ and ] collapse the panels, the right rail reopens on a tab, and leaving Simulate asks about unsaved changes", async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 900 });
    const { id } = await createFunnel({});
    await openEditor(page, id);
    const insp = page.locator("#fm-insp");
    await expect(insp).toBeVisible();
    await page.locator(".react-flow__pane").click({ position: { x: 500, y: 420 } });
    await page.keyboard.press("]");
    await expect(insp).toBeHidden();
    const rail = page.getByRole("navigation", { name: "Details panel (collapsed)" });
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox())!.width).toBeLessThanOrEqual(40);
    await rail.getByRole("button", { name: "Funnel notes" }).click();
    await expect(insp).toBeVisible();
    await expect(rail).toBeHidden();
    await page.keyboard.press("[");
    await expect(page.locator(".fm-side")).toBeHidden();
    await page.keyboard.press("[");
    await expect(page.locator(".fm-side")).toBeVisible();

    // Simulate: S starts it, a what-if change marks it unsaved, Esc asks once
    await page.locator(".react-flow__pane").click({ position: { x: 500, y: 420 } });
    await page.keyboard.press("s");
    const bar = page.getByLabel("Simulate", { exact: true });
    await expect(bar).toBeVisible();
    await expect(bar.getByText(/Nothing yet/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(bar).toBeHidden();
  });
});
