import { expect, test } from "@playwright/test";

// No session: a visitor who isn't a team member.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("private internal tool", () => {
  for (const path of ["/", "/clients", "/clients/10000000-0000-4000-8000-000000000001", "/templates", "/settings", "/funnels/20000000-0000-4000-8000-000000000001", "/update-password"]) {
    test(`anonymous visit to ${path} goes to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    });
  }

  test("there is no public sign-up", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Team members only")).toBeVisible();
    await expect(page.getByRole("link", { name: /create an account/i })).toHaveCount(0);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login/);
  });

  test("magic link form doesn't reveal whether an email is on the team", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "Magic link" }).click();
    await page.getByLabel("Email").fill("stranger@example.test");
    await page.getByRole("button", { name: "Email me a link" }).click();
    await expect(page.getByRole("status")).toContainText("If that email has an account");
  });

  test("share link shows only that funnel, without signing in", async ({ page }) => {
    await page.goto("/s/demo-share-token");
    await expect(page.locator(".fm-editor")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Funnel name" })).toHaveValue("PT tripwire funnel");
    // no way into the internal app from here
    await expect(page.getByRole("link", { name: /back to/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /version history/i })).toHaveCount(0);
  });

  test("unknown share token shows nothing", async ({ page }) => {
    await page.goto("/s/not-a-real-token-123");
    await expect(page.getByRole("heading", { name: "This link is no longer active" })).toBeVisible();
    const r = await page.request.get("/api/share/not-a-real-token-123");
    expect(r.status()).toBe(404);
  });

  test("security headers and no indexing", async ({ page }) => {
    const r = await page.request.get("/login");
    expect(r.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(r.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(r.headers()["x-frame-options"]).toBe("DENY");
    const robots = await page.request.get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /");
  });
});
