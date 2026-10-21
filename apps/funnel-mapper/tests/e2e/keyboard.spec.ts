import { expect, test, type Page } from "@playwright/test";
import { createFunnel, openEditor } from "./helpers";

// Keyboard use: every Tab stop is visible and shows a focus ring, Reports does not leave Tab stops on the covered map, and dialogs
// close with Escape and give focus back.
async function tabWalk(page: Page, n: number) {
  const stops: { inCanvas: boolean; ring: boolean; label: string }[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return { inCanvas: false, ring: true, label: "(body)" };
        const own = getComputedStyle(el);
        const wrap = el.closest(".fm-search, .fm-sb-s") ? getComputedStyle(el.closest(".fm-search, .fm-sb-s") as HTMLElement) : null; // the search field rings its frame
        const ring = (own.outlineStyle !== "none" && parseFloat(own.outlineWidth) > 0) || own.boxShadow !== "none" || (!!wrap && wrap.boxShadow !== "none");
        return { inCanvas: !!el.closest(".react-flow"), ring, label: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}"` };
      }),
    );
  }
  return stops;
}

test.describe("Keyboard", () => {
  test("every Tab stop in the editor, Funnels, Clients and Reports shows a focus ring", async ({ page }) => {
    test.setTimeout(150_000);
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const missing: string[] = [];
    for (const [where, go, n] of [
      ["editor", async () => {}, 40],
      ["funnels", async () => page.goto("/funnels"), 25],
      ["clients", async () => page.goto("/clients"), 25],
      ["reports", async () => page.goto(`/funnels/${id}?view=reports&section=overview`), 40],
    ] as [string, () => Promise<unknown>, number][]) {
      await go();
      await page.waitForTimeout(600);
      for (const s of await tabWalk(page, n)) if (!s.ring) missing.push(`${where}: ${s.label}`);
    }
    expect(missing).toEqual([]);
  });

  test("Reports leaves no Tab stops on the covered map", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await page.goto(`/funnels/${id}?view=reports&section=overview`);
    await expect(page.locator(".fm-rmain")).toBeVisible();
    const stops = await tabWalk(page, 60);
    expect(stops.filter((s) => s.inCanvas).map((s) => s.label)).toEqual([]);
    // and the map is reachable again when you go back to it
    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.locator(".fm-stage")).not.toHaveAttribute("inert", "");
  });

  test("dialogs close with Escape and hand focus back to what opened them", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const share = page.getByRole("button", { name: /^Share/ }).first();
    await share.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: /^Share with/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: /^Share with/ })).toBeHidden();
    await expect(share).toBeFocused();
    const help = page.getByRole("button", { name: "Help" });
    await help.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(help).toBeFocused();
  });
});
