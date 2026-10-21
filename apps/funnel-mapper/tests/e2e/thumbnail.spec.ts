import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createFunnel, node, nodes, openEditor, pos, waitSaved } from "./helpers";

// Page URL -> capture -> thumbnail on the real canvas card. The app runs with CAPTURE_URL_TEMPLATE pointing at tests/e2e/capture-stub.mjs.

const shotOf = (page: Page, name: string) => node(page, name).locator(".fm-shot");
async function visibleSize(page: Page, name: string) {
  return shotOf(page, name).evaluate((i) => ({ w: i.clientWidth, h: i.clientHeight, natural: (i as HTMLImageElement).naturalWidth }));
}

async function capture(page: Page, name: string, url = "https://example.com/quiz") {
  await node(page, name).click();
  await page.getByLabel("Page URL").fill(url);
  await page.getByRole("button", { name: "Capture preview" }).click();
  await expect(page.locator(".fm-toast")).toContainText("Preview saved");
}

test.describe("Page URL to thumbnail", () => {
  test("a captured page shows on the canvas card at the default zoom, survives reload, and can be replaced and removed", async ({ page }) => {
    const { id, graph } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const quiz = graph.nodes.find((n) => n.name === "Quiz funnel")!;
    const before = { pos: await pos(page, quiz.id), edges: await page.locator(".react-flow__edge").count(), kpi: await page.getByRole("contentinfo", { name: "Funnel numbers" }).innerText() };

    await capture(page, "Quiz funnel");
    // the picture is actually on the card (the default fit zoom is the "far" detail band, where wireframes are hidden)
    await expect(shotOf(page, "Quiz funnel")).toBeVisible();
    await expect.poll(async () => (await visibleSize(page, "Quiz funnel")).natural).toBeGreaterThan(0);
    const size = await visibleSize(page, "Quiz funnel");
    expect(size.w).toBeGreaterThan(40);
    expect(size.h).toBeGreaterThan(8);
    await waitSaved(page);

    // nothing else about the page changed: place, connections and numbers
    expect(await pos(page, quiz.id)).toEqual(before.pos);
    expect(await page.locator(".react-flow__edge").count()).toBe(before.edges);
    expect(await page.getByRole("contentinfo", { name: "Funnel numbers" }).innerText()).toBe(before.kpi);

    // reload: persisted
    await page.reload();
    await expect(shotOf(page, "Quiz funnel")).toBeVisible();
    await expect.poll(async () => (await visibleSize(page, "Quiz funnel")).natural).toBeGreaterThan(0);

    // hovering the strip shows a larger peek
    await node(page, "Quiz funnel").locator(".fm-picwin").first().hover();
    await expect(page.locator(".fm-peek .fm-shot")).toBeVisible();
    await page.mouse.move(5, 300);
    await expect(page.locator(".fm-peek")).toHaveCount(0);

    // replace, then remove: the wireframe is back and the URL stays editable
    await node(page, "Quiz funnel").click();
    await page.getByRole("button", { name: "Replace capture" }).click();
    await expect(page.locator(".fm-toast")).toContainText("Preview saved");
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(shotOf(page, "Quiz funnel")).toHaveCount(0);
    await expect(node(page, "Quiz funnel").locator(".fm-picwin:not(.has-shot) svg").first()).toBeAttached(); // the stand-in is back (drawn from the mid zoom up)
    await expect(page.getByLabel("Page URL")).toHaveValue("https://example.com/quiz");
    await expect(nodes(page)).toHaveCount(graph.nodes.length);
  });

  test("a failed capture leaves the page, its URL and its numbers alone and offers a retry", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const kpi = await page.getByRole("contentinfo", { name: "Funnel numbers" }).innerText();
    await node(page, "Quiz funnel").click();
    await page.getByLabel("Page URL").fill("https://example.com/fail");
    await page.getByRole("button", { name: "Capture preview" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "wireframe stays" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(shotOf(page, "Quiz funnel")).toHaveCount(0);
    await expect(page.getByLabel("Page URL")).toHaveValue("https://example.com/fail");
    expect(await page.getByRole("contentinfo", { name: "Funnel numbers" }).innerText()).toBe(kpi);
    // fix the address and it works
    await page.getByLabel("Page URL").fill("https://example.com/ok");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator(".fm-toast")).toContainText("Preview saved");
    await expect(shotOf(page, "Quiz funnel")).toBeVisible();
  });

  test("when capture is not set up the editor says so and goes straight to upload", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await page.route("**/api/capture", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable", message: "Automatic capture isn’t set up here. Upload a screenshot instead." }) }));
    await openEditor(page, id);
    await node(page, "Quiz funnel").click();
    await page.getByLabel("Page URL").fill("https://example.com/quiz");
    await page.getByRole("button", { name: "Capture preview" }).click();
    await expect(page.getByRole("status").filter({ hasText: "CAPTURE_URL_TEMPLATE" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Capture preview" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(page.getByText("Screenshot", { exact: false }).first()).toBeVisible(); // the upload control is open
  });

  test("the picture appears in presentation and in the SVG export, and never on a share link", async ({ page, browser }) => {
    const { id, sb } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await capture(page, "Quiz funnel");
    await waitSaved(page);
    // SVG export embeds the captured page
    await page.getByRole("button", { name: "Funnel menu" }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Map image (.svg)" }).click()]);
    const svg = readFileSync((await dl.path())!).toString();
    expect(svg).toMatch(/<image[^>]+href="data:image\/(png|webp|jpeg);base64,/);
    // presentation uses the same card
    await page.getByRole("button", { name: "Present" }).first().click();
    await page.getByRole("button", { name: "Next stage" }).click();
    await page.getByRole("button", { name: "Next stage" }).click();
    await expect(page.locator(".fm-present .fm-shot").first()).toBeAttached();
    await page.getByRole("button", { name: "Exit" }).click();
    // a share link never carries screenshots (private bucket)
    const link = await sb.from("share_links").insert({ funnel_id: id }).select("token").single();
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    await p.goto(`/s/${link.data!.token}`);
    await expect(node(p, "Quiz funnel")).toBeVisible();
    await expect(p.locator(".fm-shot")).toHaveCount(0);
    expect(await p.content()).not.toContain("shot-");
    await ctx.close();
  });

  test("the preview opens from the picture only: hovering the name or the number chip never opens it", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await capture(page, "Quiz funnel");
    await expect(shotOf(page, "Quiz funnel")).toBeVisible();
    await page.mouse.move(5, 300);
    await node(page, "Quiz funnel").locator(".fm-ntitle").hover();
    await page.waitForTimeout(700);
    await expect(page.locator(".fm-peek")).toHaveCount(0);
    await node(page, "Quiz funnel").locator(".fm-bchip").hover();
    await page.waitForTimeout(700);
    await expect(page.locator(".fm-peek")).toHaveCount(0);
    await node(page, "Quiz funnel").locator(".fm-picwin").hover();
    await expect(page.locator(".fm-peek")).toBeVisible();
  });
});
