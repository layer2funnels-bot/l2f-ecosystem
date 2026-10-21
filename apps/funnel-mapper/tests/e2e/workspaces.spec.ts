import { expect, test, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createFunnel, env, latestMail, openEditor, signIn, waitSaved } from "./helpers";

const TRIPWIRE = "20000000-0000-4000-8000-000000000001"; // team funnel
const INDIE_FUNNEL = "20000000-0000-4000-8000-000000000101"; // solo@independent.test's funnel

/** Follow the invite link in the latest email to `email`, choose a password, and return the signed-in page. */
async function acceptInvite(browser: Browser, email: string, since: number) {
  const mail = await latestMail(email, since);
  const href = mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)![1].replace(/&amp;/g, "&");
  const url = new URL(href);
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto(url.pathname + url.search);
  await expect(page).toHaveURL(/\/update-password/);
  await page.getByLabel("New password").fill("independent-pass-1");
  await page.getByLabel("Confirm password").fill("independent-pass-1");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL("/");
  return { ctx, page, mail };
}

test.describe("workspaces", () => {
  test("an independent user sees only their own private workspace", async ({ browser }) => {
    const { ctx, page } = await signIn(browser, "solo@independent.test");
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Solo Studio").first()).toBeVisible();
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: /Indie Client/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Sam Carter/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Second Indie Client/ })).toHaveCount(0);
    // a team funnel URL is simply not found
    const res = await page.goto(`/funnels/${TRIPWIRE}`);
    expect(res!.status()).toBe(404);
    // their own funnel opens in the editor
    await openEditor(page, INDIE_FUNNEL);
    await page.goto("/settings#workspace");
    await expect(page.getByTestId("current-workspace")).toContainText("Private workspace");
    // their own workspace has its own team: only themselves, no Layer2Funnels people
    await page.goto("/settings#team");
    await expect(page.getByRole("list", { name: "Team members" })).toContainText("solo@independent.test");
    await expect(page.getByRole("list", { name: "Team members" })).not.toContainText("layer2funnels");
    await expect(page.getByRole("heading", { name: "Independent accounts" })).toHaveCount(0);
    await page.goto("/templates");
    await expect(page.getByRole("button", { name: /^Your templates|^Saved templates|^Team templates/ }).first()).toBeVisible();
    await ctx.close();
  });

  test("the team can't see independent users' clients or funnels", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: /Sam Carter/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Indie Client/ })).toHaveCount(0);
    const res = await page.goto(`/funnels/${INDIE_FUNNEL}`);
    expect(res!.status()).toBe(404);
  });

  test("a team admin creates an independent account; it gets its own empty workspace", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const email = `indie.${Date.now()}@example.test`;
    const since = Date.now();
    await page.goto("/settings#independent");
    const section = page.getByRole("region", { name: "Independent accounts" });
    await section.getByLabel("Email", { exact: true }).fill(email);
    await section.getByLabel("Name (optional)", { exact: true }).fill("Indie Person");
    await section.getByLabel("Workspace name (optional)").fill("Indie Person Co");
    await section.getByRole("button", { name: "Create independent account" }).click();
    await expect(section.getByText("Account created")).toBeVisible();
    // the team list doesn't gain them
    await page.goto("/settings#team");
    await expect(page.getByRole("list", { name: "Team members" })).not.toContainText(email);

    const { ctx, page: indie, mail } = await acceptInvite(browser, email, since);
    expect(mail.HTML).toContain("private Funnel Mapper Pro V2 workspace");
    await expect(indie.getByText("Indie Person Co").first()).toBeVisible();
    await indie.goto("/clients");
    await expect(indie.getByRole("link", { name: /Sam Carter/ })).toHaveCount(0);
    await expect(indie.getByRole("link", { name: /Indie Client/ })).toHaveCount(0);
    await indie.goto("/settings#workspace");
    await expect(indie.getByTestId("current-workspace")).toContainText("Private workspace");
    await ctx.close();
  });

  test("private sign-up link: unknown codes 404; the real one creates an independent workspace", async ({ page, browser }) => {
    test.setTimeout(120_000);
    // admins see the link in Settings
    await page.goto("/settings#independent");
    const link = await page.getByTestId("join-url").innerText();
    const path = new URL(link).pathname;

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await anon.newPage();
    expect((await p.goto("/join/not-the-code"))!.status()).toBe(404);
    // the login page never links to sign-up
    await p.goto("/login");
    await expect(p.getByRole("link", { name: /sign up|create/i })).toHaveCount(0);

    const email = `joined.${Date.now()}@example.test`;
    const since = Date.now();
    await p.goto(path);
    await p.getByLabel("Your name").fill("Joined Person");
    await p.getByLabel("Email").fill(email);
    await p.getByLabel("Business or workspace name (optional)").fill("Joined Studio");
    await p.getByRole("button", { name: "Create workspace" }).click();
    await expect(p.getByRole("status")).toContainText("Check your email");
    await anon.close();

    const { ctx, page: joined } = await acceptInvite(browser, email, since);
    await expect(joined.getByText("Joined Studio").first()).toBeVisible();
    await joined.goto("/clients");
    await expect(joined.getByRole("link", { name: /Sam Carter/ })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("invite links and workspace identity", () => {
  // Supabase's standard invite email links to Supabase, which verifies the token and returns the session in the URL
  // fragment, either to our callback (redirect allowed) or to the site root (fallback). Both must sign the invitee in.
  for (const landing of ["callback", "site root"] as const) {
    test(`standard invite link (session in the URL fragment, via ${landing}) → team member`, async ({ browser, baseURL }) => {
      const svc = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
      const email = `fragment.${Date.now()}@layer2funnels.test`;
      // the local stack only allows localhost:3000 redirects; anything else falls back to the site root
      const redirectTo = landing === "callback" ? "http://localhost:3000/auth/callback?next=/update-password" : "http://not-allowed.test/";
      const link = await svc.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
      expect(link.error).toBeNull();
      const res = await fetch(link.data.properties!.action_link, { redirect: "manual" });
      const dest = new URL(res.headers.get("location")!);
      expect(dest.hash).toContain("access_token=");
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await ctx.newPage();
      await page.goto(`${baseURL}${dest.pathname}${dest.search}${dest.hash}`);
      await expect(page).toHaveURL(/\/update-password/);
      await page.getByLabel("New password").fill("fragment-pass-1");
      await page.getByLabel("Confirm password").fill("fragment-pass-1");
      await page.getByRole("button", { name: "Save password" }).click();
      await expect(page).toHaveURL("/");
      await page.goto("/settings#workspace");
      await expect(page.getByTestId("current-workspace")).toContainText("Layer2Funnels team workspace");
      await page.goto("/clients");
      await expect(page.getByRole("link", { name: /Sam Carter/ })).toBeVisible();
      await ctx.close();
      await svc.auth.admin.deleteUser(link.data.user!.id);
    });
  }

  test("settings and sidebar show the current workspace", async ({ page, browser }) => {
    await page.goto("/settings#workspace");
    await expect(page.getByTestId("current-workspace")).toContainText("Layer2Funnels team workspace");
    await expect(page.getByTestId("workspace-kind").first()).toContainText("Team workspace");
    const { ctx, page: solo } = await signIn(browser, "solo@independent.test");
    await expect(solo).toHaveURL("/");
    await solo.goto("/settings#workspace");
    await expect(solo.getByTestId("current-workspace")).toContainText("Private workspace");
    await expect(solo.getByTestId("current-workspace")).not.toContainText("Layer2Funnels");
    await expect(solo.getByTestId("workspace-kind").first()).toContainText("Private workspace");
    await ctx.close();
  });
});

test.describe("multiple workspaces", () => {
  test("an admin creates a workspace from the left menu and switches between workspaces", async ({ browser }) => {
    const svc = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const name = `Agency ${Date.now()}`;
    const { ctx, page } = await signIn(browser, "solo@independent.test");
    await expect(page).toHaveURL("/");
    try {
      const menu = page.getByTestId("workspace-switcher").first();
      await expect(menu).toContainText("Solo Studio");
      await menu.locator("summary").click();
      await menu.getByLabel("New workspace").fill(name);
      await menu.getByRole("button", { name: "Create workspace" }).click();
      await expect(page.getByTestId("workspace-switcher").first()).toContainText(name);
      // a brand-new workspace has its own (empty) data and only its creator as a member
      await page.goto("/clients");
      await expect(page.getByRole("link", { name: /Indie Client/ })).toHaveCount(0);
      await page.goto("/settings#workspace");
      await expect(page.getByTestId("current-workspace")).toContainText(name);
      await page.goto("/settings#team");
      await expect(page.getByRole("list", { name: "Team members" }).getByRole("listitem")).toHaveCount(1);
      // switch back: the original workspace's data again
      const m2 = page.getByTestId("workspace-switcher").first();
      await m2.locator("summary").click();
      await m2.getByRole("button", { name: /Solo Studio/ }).click();
      await expect(page.getByTestId("workspace-switcher").first()).toContainText("Solo Studio");
      await page.goto("/clients");
      await expect(page.getByRole("link", { name: /Indie Client/ }).first()).toBeVisible();
    } finally {
      await ctx.close();
      const { data } = await svc.from("workspaces").select("id").eq("agency_name", name);
      for (const w of data ?? []) {
        await svc.from("profiles").update({ workspace_id: (await svc.from("workspace_members").select("workspace_id").eq("user_id", "00000000-0000-4000-8000-000000000004").neq("workspace_id", w.id).limit(1).single()).data!.workspace_id }).eq("workspace_id", w.id);
        await svc.from("workspaces").delete().eq("id", w.id);
      }
    }
  });

  test("members only see workspaces they belong to, and can't create one", async ({ browser }) => {
    const { ctx, page } = await signIn(browser, "teammate@layer2funnels.test");
    await expect(page).toHaveURL("/");
    const menu = page.getByTestId("workspace-switcher").first();
    await menu.locator("summary").click();
    await expect(menu.getByRole("list", { name: "Your workspaces" }).getByRole("listitem")).toHaveCount(1);
    await expect(menu.getByRole("button", { name: "Create workspace" })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("editor panels", () => {
  test("block library and details panel collapse and expand; the canvas takes the space and keeps working", async ({ page }) => {
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    const stage = page.locator(".fm-stage");
    const w0 = (await stage.boundingBox())!.width;
    const edges = await page.locator(".react-flow__edge").count();

    await page.getByRole("button", { name: "Collapse block library" }).first().click();
    await expect(page.locator("#fm-side")).toBeHidden();
    await expect.poll(async () => (await stage.boundingBox())!.width).toBeGreaterThan(w0 + 200);
    await page.getByRole("button", { name: "Collapse details panel" }).click();
    await expect(page.locator("#fm-insp")).toBeHidden();
    await expect.poll(async () => (await stage.boundingBox())!.width).toBeGreaterThan(w0 + 500);
    // the controls stay in the toolbar, labelled for expanding
    await expect(page.getByRole("button", { name: "Expand block library" })).toHaveAttribute("aria-expanded", "false");

    // canvas still works: select, zoom, minimap, Tidy Up (+ autosave), connections untouched
    const first = page.locator(".react-flow__node").first();
    await first.click();
    await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
    await expect(page.locator(".react-flow__minimap")).toBeVisible();
    const vp = page.locator(".react-flow__viewport");
    const before = await vp.getAttribute("style");
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(() => vp.getAttribute("style")).not.toBe(before);
    await page.getByRole("button", { name: "Tidy up" }).click();
    await waitSaved(page);
    await expect(page.locator(".react-flow__edge")).toHaveCount(edges);

    // remembered after a reload
    await page.reload();
    await expect(page.locator(".fm-saved")).toContainText("Saved");
    await expect(page.locator("#fm-side")).toBeHidden();
    await expect(page.locator("#fm-insp")).toBeHidden();

    // version history re-opens the right panel; both restore immediately
    await page.getByRole("button", { name: "Version history" }).first().click();
    await expect(page.locator("#fm-insp")).toBeVisible();
    await page.getByRole("button", { name: "Expand block library" }).click();
    await expect(page.locator("#fm-side")).toBeVisible();
    await expect(page.locator("#fm-side").getByRole("searchbox")).toBeVisible();
    await expect.poll(async () => (await stage.boundingBox())!.width).toBeLessThan(w0 + 5);
  });

  test("tablet keeps its drawers; the desktop toggles are hidden", async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 1000 });
    const { id } = await createFunnel({ template: "quiz" });
    await openEditor(page, id);
    await expect(page.getByRole("button", { name: "Collapse block library" })).not.toBeInViewport(); // the drawer is closed
    await expect(page.getByRole("button", { name: "Collapse details panel" })).not.toBeInViewport();
    await page.getByRole("button", { name: "Show building blocks" }).click();
    await expect(page.locator("#fm-side")).toBeInViewport();
  });
});
