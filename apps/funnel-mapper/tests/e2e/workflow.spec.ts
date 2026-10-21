import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { centre, drag, edgeLabels, node, nodes, waitSaved } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

/** The everyday journey of a teammate, end to end, through the UI only. */
test("create a client, map a funnel, save, reopen, version, template, share and export", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  const clientName = `Nova Yoga ${stamp}`;

  // --- new client ---
  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).first().click();
  const sheet = page.getByRole("dialog", { name: "New client" });
  await sheet.getByLabel("Client name *").fill(clientName);
  // required fields first; the rest sits under "Add details"
  await expect(sheet.getByLabel("Business name")).toBeHidden();
  await sheet.getByText("Add details").click();
  await sheet.getByLabel("Business name").fill("Nova Yoga Studio");
  await sheet.getByLabel("Niche", { exact: true }).fill("Wellness");
  await sheet.getByLabel("Status").selectOption("active");
  await sheet.getByLabel("Monthly retainer").fill("1200");
  await sheet.getByLabel("Tags").fill("yoga, launch");
  await sheet.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(clientName);
  const clientUrl = page.url();

  // --- new funnel from a template ---
  await page.getByRole("button", { name: "New funnel" }).click();
  await page.getByLabel("Start from").selectOption({ label: "8. Video Sales Letter Funnel" });
  await page.getByLabel("Funnel name (optional)").fill("Spring webinar");
  await page.getByRole("button", { name: "Create funnel" }).click();
  await expect(page).toHaveURL(/\/funnels\//);
  await expect(page.getByRole("textbox", { name: "Funnel name" })).toHaveValue("Spring webinar");
  await expect(nodes(page)).toHaveCount(8); // 7 template blocks + the example traffic source
  const funnelUrl = page.url();

  // --- edit visually: add a downsell and connect the checkout's "didn't buy" path to it ---
  await page.getByLabel("Search blocks").fill("Downsell");
  await page.getByRole("button", { name: "Add Downsell", exact: true }).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 520, y: 600 } });
  await expect(nodes(page)).toHaveCount(9);
  await page.getByLabel("Name", { exact: true }).fill("Payment plan offer");
  await page.getByLabel("Price (£)").fill("297");
  await drag(page, await centre(page, node(page, "Order form + bump").locator(".fm-port.side.bottom")), await centre(page, node(page, "Payment plan offer")));
  await expect(page.locator("path.fm-edge")).toHaveCount(10);
  await expect(node(page, "Payment plan offer")).toBeVisible();
  await waitSaved(page);

  // --- reopen: everything persisted ---
  await page.goto(clientUrl);
  await expect(page.getByRole("link", { name: "Spring webinar", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Spring webinar", exact: true }).click();
  await expect(nodes(page)).toHaveCount(9);
  await expect(node(page, "Payment plan offer")).toBeVisible();
  // funnel maths in the report
  await expect(page.locator(".fm-kpis")).toContainText(/Revenue/); // the numbers strip carries the maths (the funnel panel no longer repeats it)

  // --- versions: save, change, restore ---
  await page.getByRole("button", { name: "Funnel menu" }).click();
  await page.getByRole("menuitem", { name: /Save version/ }).click();
  await expect(page.locator(".fm-toast")).toHaveText("Version saved");
  await node(page, "Payment plan offer").click();
  await page.keyboard.press("Delete");
  await expect(nodes(page)).toHaveCount(8);
  await waitSaved(page);
  await page.getByRole("button", { name: "Version history" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator(".fm-insp li", { hasText: "Saved" }).first().getByRole("button", { name: "Restore" }).click();
  await expect(nodes(page)).toHaveCount(9);
  await waitSaved(page);
  await page.reload();
  await expect(nodes(page)).toHaveCount(9);

  // --- save as template, then find it on the Templates page ---
  await page.getByRole("button", { name: "Funnel menu" }).click();
  await page.getByRole("menuitem", { name: "Save as template" }).click();
  await page.getByLabel("Template name").fill(`Yoga webinar ${stamp}`);
  await page.getByLabel("Category").selectOption("Webinar");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.locator(".fm-toast")).toHaveText("Saved to team templates");

  // --- exports ---
  const exportAs = async (item: string) => {
    await page.getByRole("button", { name: "Funnel menu" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: item }).click()]);
    return { name: dl.suggestedFilename(), buf: readFileSync((await dl.path())!) };
  };
  const pdf = await exportAs("PDF report for client");
  expect(pdf.name).toBe("spring-webinar.pdf");
  expect(pdf.buf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.buf.length).toBeGreaterThan(20_000);
  const png = await exportAs("Map image (.png)");
  expect(png.buf.subarray(1, 4).toString()).toBe("PNG");
  const svg = await exportAs("Map image (.svg)");
  expect(svg.buf.toString()).toContain("<svg");
  expect(svg.buf.toString()).toContain("Payment plan offer");
  const csv = await exportAs("Step report (.csv)");
  expect(csv.buf.toString()).toContain('"Payment plan offer","Downsell"');
  const json = await exportAs("Funnel file (.json)");
  const file = JSON.parse(json.buf.toString());
  expect(file.app).toBe("funnel-mapper-pro");
  expect(file.graph.nodes).toHaveLength(9);

  // --- import that file as a new funnel on the client page ---
  await page.goto(clientUrl);
  await page.getByLabel("Import funnel file").setInputFiles({ name: "spring.json", mimeType: "application/json", buffer: json.buf });
  await expect(page).toHaveURL(/\/funnels\//);
  await expect(nodes(page)).toHaveCount(9);
  expect(page.url()).not.toBe(funnelUrl);

  // --- the template is available to start new funnels ---
  await page.goto("/templates");
  await expect(page.getByRole("button", { name: `Preview Yoga webinar ${stamp}` })).toBeVisible();

  // --- share: create a read-only link and open it as the client would (no session) ---
  await page.goto(funnelUrl);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const link = await page.getByRole("textbox", { name: "Share link" }).first().inputValue();
  expect(link).toMatch(/\/s\/[0-9a-f]{48}$/);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const client = await anon.newPage();
  await client.goto(link);
  await expect(client.getByRole("textbox", { name: "Funnel name" })).toHaveValue("Spring webinar");
  await expect(client.locator(".react-flow__node")).toHaveCount(9);
  await expect(client.getByRole("button", { name: "Add Landing page", exact: true })).toHaveCount(0);
  await anon.close();

  // --- keyboard undo still works after all that ---
  await node(page, "Payment plan offer").click();
  await page.keyboard.press(`${mod}+d`);
  await expect(nodes(page)).toHaveCount(10);
  await page.keyboard.press(`${mod}+z`);
  await expect(nodes(page)).toHaveCount(9);

  // --- the portfolio shows the funnel with its numbers ---
  await page.goto(clientUrl);
  const card = page.locator("li", { has: page.getByRole("link", { name: "Spring webinar", exact: true }) }).first();
  await expect(card).toContainText("Revenue");
  await expect(card).toContainText("£");
});
