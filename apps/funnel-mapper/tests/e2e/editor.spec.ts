import { expect, test } from "@playwright/test";
import { money } from "../../lib/format";
import { compute } from "../../lib/funnel-math";
import { typeOf } from "../../lib/catalog";
import { blankSettings } from "../../lib/graph";
import { tidyLayout } from "../../lib/layout";
import { centre, createFunnel, drag, edgeLabels, node, nodes, openEditor, pos, waitSaved, paletteItem } from "./helpers";

const mod = process.platform === "darwin" ? "Meta" : "Control";

test.describe("funnel editor", () => {
  test("renders a template with the prototype's numbers", async ({ page }) => {
    const { id } = await createFunnel({ template: "tripwire" });
    await openEditor(page, id);
    await expect(nodes(page)).toHaveCount(11);
    // lines carry their rate; a label that would sit on a block or on a very short line is left out
    await expect(edgeLabels(page).first()).toBeVisible();
    expect(await edgeLabels(page).count()).toBeGreaterThanOrEqual(3);
    // KPI bar: tripwire revenue £7,485 / profit £6,825 (same as the prototype)
    await expect(page.locator(".fm-kpis")).toContainText("£7,485");
    await expect(page.locator(".fm-kpis")).toContainText("£6,825");
    await expect(node(page, "Fitness quiz")).toContainText("2,300"); // people in: the one number a block shows
  });

  test("drag a block from the palette, and tap to add", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await expect(page.locator(".fm-canvas-empty")).toBeVisible();
    const stage = await centre(page, ".fm-stage");
    await (await paletteItem(page, "Landing page")).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 300, y: 250 } });
    await expect(nodes(page)).toHaveCount(1);
    await expect(page.locator(".fm-insp h3")).toHaveText("Landing page");
    await expect(page.locator(".fm-canvas-empty")).toBeHidden();
    // dropped where the mouse was (± snapping), not at the centre
    const box = (await nodes(page).first().boundingBox())!;
    expect(box.x).toBeLessThan(stage.x);
    await (await paletteItem(page, "Facebook Ads")).click();
    await expect(nodes(page)).toHaveCount(2);
    await expect(page.locator(".fm-insp h3")).toHaveText("Facebook Ads");
  });

  test("connect ports: right = converted, bottom = didn't convert", async ({ page }) => {
    const { id } = await createFunnel();
    await openEditor(page, id);
    await (await paletteItem(page, "Facebook Ads")).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 130, y: 200 } });
    await (await paletteItem(page, "Landing page")).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 400, y: 200 } });
    await (await paletteItem(page, "Thank-you page")).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 680, y: 110 } });
    await (await paletteItem(page, "SMS")).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 680, y: 430 } });
    await expect(nodes(page)).toHaveCount(4);
    const fb = node(page, "Facebook Ads"),
      lp = node(page, "Landing page"),
      ty = node(page, "Thank-you page"),
      seq = node(page, "SMS");
    await drag(page, await centre(page, fb.locator(".fm-port.side.right")), await centre(page, lp));
    await expect(edgeLabels(page)).toHaveCount(1);
    await expect(edgeLabels(page).first()).toContainText("1,000"); // a source has no "share of arrivals": its line says how many visit
    await drag(page, await centre(page, lp.locator(".fm-port.side.right")), await centre(page, ty));
    await drag(page, await centre(page, lp.locator(".fm-port.side.bottom")), await centre(page, seq));
    await expect(page.locator("path.fm-edge")).toHaveCount(3);
    // landing converts 30%: 300 go right, 700 go down (labelled No)
    await expect(page.locator(".fm-elabel", { hasText: "30%" })).toBeVisible();
    await expect(page.locator(".fm-elabel", { hasText: "No" })).toContainText("70%");
    // the people are on hover and in the line's name
    await expect(page.locator('.fm-elabel[aria-label*="300 people"]')).toHaveCount(1);
    await expect(page.locator('.fm-elabel[aria-label*="700 people"]')).toHaveCount(1);
    // can't connect into a traffic source or to the same target twice
    await drag(page, await centre(page, lp.locator(".fm-port.side.right")), await centre(page, fb));
    await drag(page, await centre(page, lp.locator(".fm-port.side.right")), await centre(page, ty));
    await expect(page.locator("path.fm-edge")).toHaveCount(3);
  });

  test("edit an edge: share and path", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    // registration → thank-you page carries the 720 people who registered (2,400 × 30%)
    await page.locator('.fm-elabel[aria-label*="720 people"]').first().click();
    await expect(page.locator(".fm-insp h3")).toHaveText("Connection");
    await page.getByLabel("Share of them (%)").fill("50");
    await expect(page.locator('.fm-elabel[aria-label*="360 people"]')).toContainText("· 50%");
    await page.getByRole("radio", { name: "No", exact: true }).click();
    // now half of the 1,680 who didn't register
    await expect(page.locator('.fm-elabel[aria-label*="840 people"]')).toContainText("· 50%");
    await expect(page.locator('.fm-elabel[aria-label*="840 people"]')).toContainText("No");
    await page.getByRole("button", { name: "Delete connection" }).click();
    await expect(page.locator("path.fm-edge")).toHaveCount(8);
    // traffic sources have no "didn't convert" path, so the option isn't offered
    const src = graph.edges.find((e) => typeOf(graph.nodes.find((n) => n.id === e.from)!.type).cat === "traffic")!;
    await page.locator(`.react-flow__edge[data-id="${src.id}"] .react-flow__edge-interaction`).dispatchEvent("click");
    await expect(page.getByRole("radio", { name: "No", exact: true })).toHaveCount(0);
  });

  test("box select with shift-drag, then group actions", async ({ page }) => {
    const { id } = await createFunnel({ template: "call" });
    await openEditor(page, id);
    const a = (await node(page, "LinkedIn ads").boundingBox())!;
    const b = (await node(page, "Application").boundingBox())!;
    await drag(page, { x: a.x - 20, y: a.y - 30 }, { x: b.x + b.width + 10, y: b.y + b.height + 20 }, { shift: true });
    await expect(page.locator(".fm-insp h3")).toHaveText("3 blocks");
    await page.getByRole("tab", { name: "Arrange" }).click(); // several blocks: Style | Arrange
    await page.getByRole("button", { name: "Put in a stage frame" }).click();
    await expect(page.locator(".fm-frame")).toHaveCount(1);
  });

  test("copy / paste, duplicate, delete, select all and undo / redo", async ({ page }) => {
    const { id } = await createFunnel({ template: "sub" });
    await openEditor(page, id);
    await expect(nodes(page)).toHaveCount(6);
    await node(page, "TikTok ads").click();
    await page.keyboard.press(`${mod}+c`);
    await expect(page.locator(".fm-toast")).toHaveText("Copied");
    await page.keyboard.press(`${mod}+v`);
    await expect(nodes(page)).toHaveCount(7);
    await page.keyboard.press(`${mod}+d`);
    await expect(nodes(page)).toHaveCount(8);
    await page.keyboard.press("Delete");
    await expect(nodes(page)).toHaveCount(7);
    // undo / redo with the keyboard and the toolbar
    await page.keyboard.press(`${mod}+z`);
    await expect(nodes(page)).toHaveCount(8);
    await page.keyboard.press(`${mod}+Shift+z`);
    await expect(nodes(page)).toHaveCount(7);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(nodes(page)).toHaveCount(8);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(nodes(page)).toHaveCount(7);
    await page.locator(".react-flow__pane").click({ position: { x: 20, y: 400 } });
    await page.keyboard.press(`${mod}+a`);
    await expect(page.locator(".fm-insp h3")).toHaveText("7 blocks");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible();
  });

  test("dragging a frame carries the blocks inside it", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "tripwire" });
    await openEditor(page, id);
    const ig = graph.nodes.find((n) => n.name === "Instagram ads")!;
    const before = await pos(page, ig.id);
    const title = page.locator(".fm-frame .ftitle", { hasText: "Get attention" });
    const t = await centre(page, title);
    await drag(page, t, { x: t.x + 120, y: t.y + 60 });
    const after = await pos(page, ig.id);
    expect(after.x - before.x).toBeGreaterThan(100);
    expect(after.y - before.y).toBeGreaterThan(40);
    // blocks outside the frame stay put
    const quiz = graph.nodes.find((n) => n.name === "Fitness quiz")!;
    expect(await pos(page, quiz.id)).toEqual({ x: quiz.x, y: quiz.y });
  });

  test("Tidy up gives the prototype's layout, and undoes in one step", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const first = graph.nodes[0];
    await page.getByRole("button", { name: "Tidy up" }).click();
    await expect(page.locator(".fm-toast")).toContainText("Layout tidied");
    // the app's canonical footprint (200 x 76, page and offer 114): the same layout the unit tests pin, centre-aligned rows
    const laid = tidyLayout(graph.nodes, graph.edges);
    for (const [i, n] of graph.nodes.entries()) expect(await pos(page, n.id), n.name).toEqual({ x: laid[i].x, y: laid[i].y });
    await page.keyboard.press(`${mod}+z`);
    await expect.poll(() => pos(page, first.id)).toEqual({ x: first.x, y: first.y });
    // keyboard shortcut + ELK alternative
    await page.keyboard.press(`${mod}+Shift+l`);
    await expect.poll(() => pos(page, first.id)).toEqual({ x: laid[0].x, y: laid[0].y });
    await page.getByRole("button", { name: "Funnel menu" }).click();
    await page.getByRole("menuitem", { name: "Tidy up (ELK layered)" }).click();
    await expect(page.locator(".fm-toast")).toContainText("ELK");
  });

  test("Tidy up keeps notes and headings where they were placed, clear of the blocks", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "tripwire" });
    await openEditor(page, id);
    const note = graph.nodes.find((n) => n.type === "note")!;
    const coaching = graph.nodes.find((n) => n.name === "Monthly coaching")!; // the block the note sits under
    const before = { dx: note.x - coaching.x, dy: note.y - coaching.y };
    await page.getByRole("button", { name: "Tidy up" }).click();
    await expect(page.locator(".fm-toast")).toContainText("Layout tidied");
    const n = await pos(page, note.id),
      c = await pos(page, coaching.id);
    // it keeps its place next to that block; when the new layout puts a (bigger) block there it is only nudged to the nearest free spot
    expect(Math.hypot(n.x - c.x - before.dx, n.y - c.y - before.dy), "stays near the block it belongs to").toBeLessThanOrEqual(340);
    expect(n.y - c.y, "still below that block, not re-anchored").toBeGreaterThan(0);
    // on screen, the note overlaps no funnel block (frames are containers and may enclose it).
    // Every box is read in the same frame: "fit to screen" is still zooming, and boxes read one by one would mix zoom levels.
    const blocks = graph.nodes.filter((x) => !["note", "label", "frame"].includes(x.type));
    const boxes = await page.evaluate((ids) => ids.map((i) => document.querySelector(`.react-flow__node[data-id="${i}"]`)!.getBoundingClientRect().toJSON() as DOMRect), [note.id, ...blocks.map((b) => b.id)]);
    const [box, ...rest] = boxes;
    rest.forEach((r, i) => {
      const hit = box.x < r.x + r.width && box.x + box.width > r.x && box.y < r.y + r.height && box.y + box.height > r.y;
      expect(hit, `note overlaps ${blocks[i].name}`).toBe(false);
    });
  });

  test("keyboard: nudge, help, shortcuts don't fire while typing", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    const op = graph.nodes.find((n) => n.name === "Webinar registration")!;
    await node(page, "Webinar registration").click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowDown");
    await expect.poll(() => pos(page, op.id)).toEqual({ x: op.x + 11, y: op.y + 33 });
    // typing in the inspector must not delete the block
    const name = page.getByLabel("Name", { exact: true });
    await name.fill("Registration page");
    await name.press("Backspace");
    await expect(node(page, "Registration pag")).toHaveCount(1);
    await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } });
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("inspector edits update maths live and autosave", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    await node(page, "Program checkout").click();
    await page.getByLabel("Price (£)").fill("1997");
    const ck = graph.nodes.find((n) => n.name === "Program checkout")!;
    const expected = money(compute({ nodes: graph.nodes.map((n) => (n.id === ck.id ? { ...n, p: { ...n.p, price: 1997 } } : n)), edges: graph.edges }, blankSettings()).rev, "GBP");
    await expect(page.locator(".fm-kpis")).toContainText(expected);
    await waitSaved(page);
    await page.reload();
    await expect(page.locator(".fm-kpis")).toContainText(expected);
  });

  test("dark mode", async ({ page }) => {
    const { id } = await createFunnel({ template: "tripwire" });
    await openEditor(page, id);
    await page.getByRole("button", { name: "Funnel menu" }).click();
    await page.getByRole("menuitem", { name: "Switch light / dark" }).click();
    const theme = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(["dark", "light"]).toContain(theme);
    if (theme !== "dark") {
      await page.getByRole("button", { name: "Funnel menu" }).click();
      await page.getByRole("menuitem", { name: "Switch light / dark" }).click();
    }
    // locked Emerald dark tokens; V2 board: the right panel sits on the workspace chrome #111827
    const bg = await page.locator(".fm-insp").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(17, 24, 39)");
    // a block's name sits straight on the canvas (no box): light ink on the dark canvas
    const ink = await page.locator(".fm-ntitle > span").first().evaluate((el) => getComputedStyle(el).color);
    expect(ink).toBe("rgb(226, 232, 240)");
    await page.screenshot({ path: "test-results/editor-dark.png" });
    // persists across reloads
    await page.reload();
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
    await page.evaluate(() => localStorage.removeItem("fm-theme"));
  });
});

test.describe("tablet and phone", () => {
  test("tablet: palette and inspector become drawers", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/demo.json", viewport: { width: 820, height: 1180 }, hasTouch: true });
    const page = await ctx.newPage();
    const { id } = await createFunnel({ template: "webinar" });
    await openEditor(page, id);
    await expect(page.locator(".fm-side")).not.toBeInViewport();
    await page.getByRole("button", { name: "Show building blocks" }).click();
    await expect(page.locator(".fm-side")).toBeInViewport();
    await (await paletteItem(page, "Landing page")).click();
    await expect(page.locator(".fm-side")).not.toBeInViewport();
    await expect(nodes(page)).toHaveCount(10);
    // selecting opens the inspector sheet
    await expect(page.locator(".fm-insp")).toBeInViewport({ ratio: 0.5 });
    await page.getByRole("button", { name: "Close details" }).click();
    await expect(page.locator(".fm-insp")).not.toBeInViewport();
    await page.getByRole("button", { name: "Show numbers and details" }).click();
    await expect(page.locator(".fm-insp")).toBeInViewport({ ratio: 0.5 });
    await page.screenshot({ path: "test-results/editor-tablet.png" });
    await ctx.close();
  });

  test("phone: compact bar, KPI chips, and a 68px action bar when a block is selected", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/demo.json", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const { id } = await createFunnel({ template: "tripwire" });
    await page.goto(`/funnels/${id}`);
    await expect(nodes(page)).toHaveCount(11);
    // top bar: back, name, Reports, overflow; the KPI chips scroll inside their own strip
    await expect(page.getByRole("link", { name: /^Back to/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reports", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "More" })).toBeVisible();
    await expect(page.locator(".fm-kpis")).toBeVisible();
    // no horizontal page scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // the library opens from the 52px + button
    const fab = page.getByRole("button", { name: "Show building blocks" });
    expect((await fab.boundingBox())!.width).toBeGreaterThanOrEqual(52);
    // selecting a block swaps the KPI chips for the action bar; there is no floating toolbar on a phone
    await page.locator(".react-flow__node").first().dispatchEvent("click");
    const bar = page.getByRole("toolbar", { name: "Block actions" });
    await expect(bar).toBeVisible();
    expect((await bar.boundingBox())!.height).toBeGreaterThanOrEqual(68);
    await expect(bar.getByRole("button", { name: "Next step" })).toBeVisible();
    await expect(page.locator(".fm-ftb")).toBeHidden();
    await page.screenshot({ path: "test-results/editor-phone.png" });
    await ctx.close();
  });

});
