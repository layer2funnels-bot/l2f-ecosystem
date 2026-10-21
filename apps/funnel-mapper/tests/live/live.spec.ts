import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { liveContext } from "../../playwright.live.config";
import { centre, drag, edgeLabels, node, nodes, waitSaved } from "../e2e/helpers";

const STAMP = process.env.LIVE_STAMP ?? `${Date.now()}`;
const mod = process.platform === "darwin" ? "Meta" : "Control";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.LIVE_EMAIL!);
  await page.getByLabel("Password").fill(process.env.LIVE_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe.configure({ mode: "serial" });

test("privacy: internal pages need sign-in, no public sign-up, security headers", async ({ page, request }) => {
  for (const p of ["/", "/clients", "/templates", "/settings"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/login/);
  }
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Team members only")).toBeVisible();
  const r = await request.get("/login");
  expect(r.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(r.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(r.headers()["x-frame-options"]).toBe("DENY");
});

test("the everyday journey on the live site", async ({ page, browser }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await expect(page.getByRole("region", { name: "Totals" })).toContainText("Active clients");

  // client
  const clientName = `Live check client UI ${STAMP}`;
  await page.goto("/clients/new");
  await page.getByLabel("Client name *").fill(clientName);
  await page.getByLabel("Niche").fill("Live check");
  await page.getByLabel("Status").selectOption("active");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(clientName);
  const clientUrl = page.url();
  await page.getByRole("textbox", { name: "Notes", exact: true }).fill("Live check notes");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  // funnel from a built-in template
  await page.getByRole("button", { name: "New funnel" }).click();
  await page.getByLabel("Start from").selectOption({ label: "Webinar funnel" });
  await page.getByLabel("Name (optional)").fill("Live webinar");
  await page.getByRole("button", { name: "Create funnel" }).click();
  await expect(page).toHaveURL(/\/funnels\//);
  await expect(nodes(page)).toHaveCount(9);
  await expect(page.locator(".fm-kpis")).toContainText("£13,132"); // same numbers as the prototype
  const funnelUrl = page.url();

  // edit visually + autosave
  await page.getByRole("button", { name: "Add Downsell" }).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 520, y: 600 } });
  await expect(nodes(page)).toHaveCount(10);
  await page.getByLabel("Name", { exact: true }).fill("Payment plan offer");
  await page.getByLabel("Price (£)").fill("297");
  await page.getByLabel("Internal notes").fill("INTERNAL live note");
  await drag(page, await centre(page, node(page, "Program checkout").locator(".fm-port.alt")), await centre(page, node(page, "Payment plan offer")));
  await expect(edgeLabels(page)).toHaveCount(10);
  await waitSaved(page);
  await page.reload();
  await expect(nodes(page)).toHaveCount(10);
  await expect(node(page, "Payment plan offer")).toBeVisible();

  // undo / redo
  await node(page, "Payment plan offer").click();
  await page.keyboard.press(`${mod}+d`);
  await expect(nodes(page)).toHaveCount(11);
  await page.keyboard.press(`${mod}+z`);
  await expect(nodes(page)).toHaveCount(10);
  await waitSaved(page);

  // versions
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Save version/ }).click();
  await expect(page.locator(".fm-toast")).toHaveText("Version saved");
  await node(page, "Payment plan offer").click();
  await page.keyboard.press("Delete");
  await expect(nodes(page)).toHaveCount(9);
  await waitSaved(page);
  await page.getByRole("button", { name: "Version history" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator(".fm-insp li", { hasText: "Saved" }).first().getByRole("button", { name: "Restore" }).click();
  await expect(nodes(page)).toHaveCount(10);
  await waitSaved(page);

  // reports
  await page.getByRole("button", { name: "Close versions" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
  for (const tab of ["Steps", "Sources", "What-if", "Costs", "Scenarios", "Forecast", "Actuals", "Math"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.locator("#rbody")).not.toBeEmpty();
  }

  // template
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  await page.getByLabel("Template name").fill(`Live check template ${STAMP}`);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.locator(".fm-toast")).toHaveText("Saved to team templates");

  // exports
  const exportAs = async (item: string) => {
    await page.getByRole("button", { name: "File" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: item }).click()]);
    return readFileSync((await dl.path())!);
  };
  expect((await exportAs("PDF report for client")).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await exportAs("Map image (.png)")).subarray(1, 4).toString()).toBe("PNG");
  expect((await exportAs("Map image (.svg)")).toString()).toContain("<svg");
  expect((await exportAs("Step report (.csv)")).toString()).toContain("Payment plan offer");
  const json = await exportAs("Funnel file (.json)");
  expect(JSON.parse(json.toString()).graph.nodes).toHaveLength(10);

  // import as a new funnel
  await page.goto(clientUrl);
  await page.getByLabel("Import funnel file").setInputFiles({ name: "live.json", mimeType: "application/json", buffer: json });
  await expect(page).toHaveURL(/\/funnels\//);
  await expect(nodes(page)).toHaveCount(10);

  // templates page
  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: `Live check template ${STAMP}` })).toBeVisible();

  // share links, opened as the client would (no session)
  const makeLink = async (hide: boolean) => {
    await page.goto(funnelUrl);
    await page.getByRole("button", { name: "Share" }).click();
    const dlg = page.getByRole("dialog", { name: "Share with your client" });
    const box = dlg.getByLabel("Hide numbers (show the journey only)");
    if (hide) await box.check();
    else await box.uncheck();
    const links = dlg.getByRole("textbox", { name: "Share link" });
    await page.waitForTimeout(500); // existing links load when the dialog opens
    const before = await links.count();
    await dlg.getByRole("button", { name: "Create link" }).click();
    await expect(links).toHaveCount(before + 1);
    const link = await links.first().inputValue();
    await dlg.getByRole("button", { name: "Done", exact: true }).click();
    return link;
  };
  const viewLink = await makeLink(false);
  const ctx = await browser.newContext({ ...liveContext, storageState: { cookies: [], origins: [] } });
  const c = await ctx.newPage();
  await c.goto(viewLink);
  await expect(c.locator(".react-flow__node")).toHaveCount(10);
  expect(await c.content()).not.toContain("INTERNAL live note");
  await c.locator(".react-flow__node", { hasText: "Live webinar" }).click();
  await c.getByLabel("Your name").fill("Live check client");
  await c.getByLabel(/Comment on/).fill(`Live check comment ${STAMP}`);
  await c.getByRole("button", { name: "Post comment" }).click();
  await expect(c.getByText(`Live check comment ${STAMP}`)).toBeVisible();
  const hiddenLink = await makeLink(true);
  await c.goto(hiddenLink);
  await expect(c.locator(".react-flow__node")).toHaveCount(10);
  await expect(c.locator(".fm-kpis")).toHaveCount(0);
  await expect(c.getByRole("heading", { name: "The journey" })).toBeVisible();
  expect(await c.locator("body").innerText()).not.toMatch(/£\s?\d/); // no money anywhere on screen
  await ctx.close();

  // the comment reached the team
  await page.goto(funnelUrl);
  await page.getByRole("button", { name: /Client comments/ }).click();
  await expect(page.getByText(`Live check comment ${STAMP}`)).toBeVisible();

  // portfolio card shows numbers; settings show the team
  await page.goto(clientUrl);
  await expect(page.getByRole("link", { name: "Live webinar", exact: true }).first()).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByRole("list", { name: "Team members" })).toContainText(process.env.LIVE_EMAIL!);
});
