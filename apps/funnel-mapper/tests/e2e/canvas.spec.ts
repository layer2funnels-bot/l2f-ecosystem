import { expect, test, type Page } from "@playwright/test";
import { addFromPalette, centre, createFunnel, drag, node, nodes, openEditor, pos, waitSaved } from "./helpers";

const rfNode = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const styleTab = (page: Page) => page.getByRole("tab", { name: "Style" });
const detailsTab = (page: Page) => page.getByRole("tab", { name: "Details" });

test.describe("canvas completeness (Batch 2)", () => {
  test.afterEach(async ({ page }) => {
    // leave the remembered inspector tab on Details for the other suites
    if (await detailsTab(page).isVisible().catch(() => false)) await detailsTab(page).click();
  });

  test("canvas text: Font Size label, text styling and persistence", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await addFromPalette(page, "Heading");
    await expect(page.getByLabel("Font Size")).toBeVisible();
    await expect(page.getByText("Size (px)")).toHaveCount(0);
    await page.getByLabel("Font Size").fill("40");
    await styleTab(page).click();
    await page.getByLabel("Font family").selectOption("serif");
    await page.getByRole("group", { name: "Weight" }).getByRole("button", { name: "Bold", exact: true }).click();
    await page.getByRole("button", { name: "Italic" }).click();
    await page.getByRole("button", { name: "Underline" }).click();
    await page.getByRole("group", { name: "Alignment" }).getByRole("button", { name: "Centre" }).click();
    await page.getByLabel("Text colour", { exact: true }).fill("#34d399");
    await page.getByLabel("Letter spacing (px)").fill("2");
    const text = page.locator(".fm-node.label .ntext");
    await expect(text).toHaveCSS("font-size", "40px");
    await expect(text).toHaveCSS("font-weight", "700");
    await expect(text).toHaveCSS("font-style", "italic");
    await expect(text).toHaveCSS("text-align", "center");
    await expect(text).toHaveCSS("letter-spacing", "2px");
    await expect(text).toHaveCSS("color", "rgb(52, 211, 153)");
    expect(await text.evaluate((el) => getComputedStyle(el).textDecorationLine)).toContain("underline");
    await waitSaved(page);
    await page.reload();
    await expect(page.locator(".fm-node.label .ntext")).toHaveCSS("font-style", "italic");
    await expect(page.locator(".fm-node.label .ntext")).toHaveCSS("font-size", "40px");
  });

  test("block style (colour, icon, number chip), lock and layer order", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    const target = graph.nodes.find((n) => n.name === "Live webinar")!;
    await node(page, "Live webinar").click();
    await styleTab(page).click();
    // a block is a picture with its name under it: colour, icon and the number chip are all that is styled
    await expect(page.getByLabel("Fill", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Corner radius")).toHaveCount(0);
    await expect(page.getByLabel("Border colour")).toHaveCount(0);
    await page.getByRole("radio", { name: "#FB923C" }).click();
    await page.getByLabel("Search icons").fill("star");
    await page.getByRole("button", { name: "Icon star" }).click();
    const blk = node(page, "Live webinar").locator(".fm-blk");
    await expect(blk.locator(".fm-pglyph")).toHaveCSS("background-color", "rgb(251, 146, 60)");
    await page.getByRole("button", { name: "Hide", exact: true }).click();
    await expect(blk.locator(".fm-bchip")).toHaveCount(0);
    await page.getByRole("button", { name: "Show", exact: true }).click();

    // layer order
    await page.getByRole("button", { name: "Bring to front" }).click();
    const zFront = Number(await rfNode(page, target.id).evaluate((el) => getComputedStyle(el).zIndex));
    await page.getByRole("button", { name: "Send to back" }).click();
    const zBack = Number(await rfNode(page, target.id).evaluate((el) => getComputedStyle(el).zIndex));
    expect(zFront).toBeGreaterThan(zBack);

    // lock: can't be dragged, nudged or deleted; unlock restores it
    await page.getByRole("button", { name: "Lock", exact: true }).first().click();
    await expect(blk.locator(".fm-lock")).toBeVisible();
    const before = await pos(page, target.id);
    const c = await centre(page, blk.locator(".fm-ntitle"));
    await drag(page, c, { x: c.x + 150, y: c.y + 80 });
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Delete");
    expect(await pos(page, target.id)).toEqual(before);
    await expect(nodes(page)).toHaveCount(graph.nodes.length);
    await node(page, "Live webinar").click();
    await page.getByRole("button", { name: "Unlock" }).first().click();
    await expect(blk.locator(".fm-lock")).toHaveCount(0);
    await waitSaved(page);
    await page.reload();
    await expect(node(page, "Live webinar").locator(".fm-pglyph")).toHaveCSS("background-color", "rgb(251, 146, 60)");
  });

  test("connection styles: elbow, dashed, colour, arrow, skip and no-data, without changing the numbers", async ({ page }) => {
    const { id } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    const label = page.locator('.fm-elabel[aria-label*="720 people"]').first();
    await label.click();
    await expect(page.locator(".fm-insp h3")).toHaveText("Connection");
    await styleTab(page).click(); // connection inspector: Flow | Style
    await page.getByRole("group", { name: "Path" }).getByRole("button", { name: "Elbow" }).click();
    await page.getByRole("group", { name: "Line", exact: true }).getByRole("button", { name: "Dashed" }).click();
    await page.getByLabel("Line colour", { exact: true }).fill("#fb923c");
    await page.getByLabel("Thickness").fill("4");
    await page.getByRole("group", { name: "Arrow", exact: true }).getByRole("button", { name: "End", exact: true }).click();
    const path = page.locator("path.fm-edge.sel");
    await expect(path).toHaveAttribute("marker-end", /url\(#fm-arrow-/);
    await expect(path).toHaveCSS("stroke-dasharray", "8px, 6px");
    await expect(path).toHaveCSS("stroke-width", "4px");
    expect(await path.getAttribute("d")).not.toContain(" C ");
    await page.getByRole("group", { name: "Connection type" }).getByRole("button", { name: "Skip step" }).click();
    await expect(page.locator(".fm-elabel.sel")).toContainText("Skip");
    await expect(page.locator(".fm-elabel.sel")).toContainText("720");
    await page.getByRole("group", { name: "Connection type" }).getByRole("button", { name: "No data" }).click();
    await expect(page.locator(".fm-elabel.sel")).toContainText("No data");
    // the maths is untouched
    await expect(page.locator(".fm-kpis")).toContainText("£13,132");
    await waitSaved(page);
    await page.reload();
    await expect(page.locator(".fm-elabel", { hasText: "No data" })).toHaveCount(1);
  });

  test("checklists on the canvas and on a block (internal)", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    // element checklist on a block (Plan tab)
    await node(page, "Live webinar").click();
    await page.getByRole("tab", { name: "Plan" }).click();
    await page.getByLabel("New checklist item").fill("Write the slides");
    await page.keyboard.press("Enter");
    await page.getByLabel("New checklist item").fill("Book the guest");
    await page.keyboard.press("Enter");
    await page.getByRole("checkbox", { name: "Done: Write the slides" }).check();
    await page.getByRole("button", { name: "Move down" }).first().click();
    await expect(page.getByRole("list", { name: "Checklist" }).getByRole("textbox").first()).toHaveValue("Book the guest");
    await expect(node(page, "Live webinar").locator(".fm-ntasks")).toHaveText("✓ 1/2");
    // canvas checklist element
    await addFromPalette(page, "Checklist");
    await page.getByLabel("Title").fill("Launch prep");
    await page.getByLabel("New checklist item").fill("Record the webinar");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const card = page.locator(".fm-node.checklist");
    await expect(card).toContainText("Launch prep");
    await expect(card).toContainText("0/2");
    await card.getByRole("checkbox", { name: "Record the webinar" }).check();
    await expect(card).toContainText("1/2");
    await waitSaved(page);
    await page.reload();
    await expect(page.locator(".fm-node.checklist")).toContainText("1/2");
    await expect(node(page, "Live webinar").locator(".fm-ntasks")).toHaveText("✓ 1/2");
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  test("shapes and images", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await addFromPalette(page, "Rectangle");
    await page.getByLabel("Shape", { exact: true }).selectOption("ellipse");
    await page.getByLabel("Text inside").fill("Big idea");
    await expect(page.locator(".fm-shape.ellipse")).toContainText("Big idea");
    await expect(page.locator(".fm-shape.ellipse")).toHaveCSS("border-radius", "50%");
    await addFromPalette(page, "Image");
    await expect(page.locator(".fm-image.empty")).toBeVisible();
    // 2×2 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNgYGD4z8DAwMDAwAAADwABRe/1oQAAAABJRU5ErkJggg==", "base64");
    await page.getByLabel("Upload image").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(page.locator(".fm-image img")).toHaveAttribute("src", /^data:image\/(png|webp)/);
    await expect(page.getByLabel("Description (alt text)")).toHaveValue("logo");
    await waitSaved(page);
    await page.reload();
    await expect(page.locator(".fm-image img")).toHaveAttribute("alt", "logo");
    await expect(page.locator(".fm-shape.ellipse")).toContainText("Big idea");
  });
});
