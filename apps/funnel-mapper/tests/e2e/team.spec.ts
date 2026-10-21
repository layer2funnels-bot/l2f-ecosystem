import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { env, latestMail, signIn } from "./helpers";

/** Service-role client for test setup only (local stack). */
const admin = () => createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

test.describe("team workspace", () => {
  test("a teammate sees the shared portfolio but no admin controls", async ({ browser }) => {
    const { ctx, page } = await signIn(browser, "teammate@layer2funnels.test");
    await expect(page).toHaveURL("/");
    await page.goto("/clients");
    await expect(page.getByRole("link", { name: /Sam Carter/ })).toBeVisible();
    await page.goto("/settings#team");
    await expect(page.getByRole("list", { name: "Team members" })).toContainText("demo@layer2funnels.test");
    await page.goto("/settings#workspace");
    await expect(page.getByText("Only admins can change it.")).toBeVisible();
    await page.goto("/settings#team");
    await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send invite" })).toHaveCount(0);
    await ctx.close();
  });

  test("a deactivated member is signed out with an explanation", async ({ browser }) => {
    const { ctx, page } = await signIn(browser, "former@layer2funnels.test");
    await expect(page).toHaveURL(/\/login\?error=/);
    await expect(page.getByText("Your access to this workspace has been removed")).toBeVisible();
    await page.goto("/clients");
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("admin invites a teammate, who accepts and gets in; admin can deactivate and reactivate", async ({ page, browser }) => {
    test.setTimeout(120_000);
    const email = `new.${Date.now()}@layer2funnels.test`;
    await page.goto("/settings#team");
    const team = page.getByRole("region", { name: "Team" });
    await team.getByLabel("Email", { exact: true }).fill(email);
    await team.getByLabel("Name (optional)").fill("New Teammate");
    await page.getByRole("button", { name: "Send invite" }).click();
    await expect(page.getByText("Invite sent")).toBeVisible();

    const mail = await latestMail(email);
    expect(mail.Subject).toContain("invited");
    const href = mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)![1].replace(/&amp;/g, "&");
    const url = new URL(href);
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const invitee = await ctx.newPage();
    await invitee.goto(url.pathname + url.search);
    await expect(invitee).toHaveURL(/\/update-password/);
    await invitee.getByLabel("New password").fill("welcome-aboard-1");
    await invitee.getByLabel("Confirm password").fill("welcome-aboard-1");
    await invitee.getByRole("button", { name: "Save password" }).click();
    await expect(invitee).toHaveURL("/");
    await invitee.goto("/clients");
    await expect(invitee.getByRole("link", { name: /Sam Carter/ })).toBeVisible();

    // admin removes their access
    await page.reload();
    const row = page.getByRole("listitem").filter({ hasText: email });
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Deactivate" }).click();
    await expect(row).toContainText("Deactivated");
    await invitee.goto("/clients");
    await expect(invitee).toHaveURL(/\/login/);
    await row.getByRole("button", { name: "Reactivate" }).click();
    await expect(row.getByRole("button", { name: "Deactivate" })).toBeVisible();
    await ctx.close();
  });

  test("admin removes a teammate: account and email gone, their work kept and transferred", async ({ page }) => {
    const svc = admin();
    const email = `leaver.${Date.now()}@layer2funnels.test`;
    const u = await svc.auth.admin.createUser({ email, password: "leaver-pass-1", email_confirm: true });
    expect(u.error).toBeNull();
    const id = u.data.user!.id;
    await svc.from("workspace_members").update({ active: true }).eq("user_id", id);
    const c = await svc.from("clients").insert({ name: `Leaver client ${Date.now()}`, owner_id: id }).select("id").single();
    expect(c.error).toBeNull();

    await page.goto("/settings#team");
    const row = page.getByRole("listitem").filter({ hasText: email });
    page.once("dialog", (d) => d.accept());
    await row.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("list", { name: "Team members" })).not.toContainText(email);
    // the account is gone, the client survives and now belongs to the admin
    expect((await svc.auth.admin.getUserById(id)).data.user).toBeNull();
    const kept = await svc.from("clients").select("owner_id").eq("id", c.data!.id).single();
    expect(kept.data!.owner_id).toBe("00000000-0000-4000-8000-000000000001");
    await svc.from("clients").delete().eq("id", c.data!.id);
  });

  test("magic link sign-in for a team member", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByRole("tab", { name: "Magic link" }).click();
    await page.getByLabel("Email").fill("teammate@layer2funnels.test");
    const sent = Date.now();
    await page.getByRole("button", { name: "Email me a link" }).click();
    await expect(page.getByRole("status")).toContainText("sign-in link is on its way");
    const mail = await latestMail("teammate@layer2funnels.test", sent);
    const href = mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)![1].replace(/&amp;/g, "&");
    const url = new URL(href);
    await page.goto(url.pathname + url.search);
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Good (morning|afternoon|evening)/);
    await ctx.close();
  });

  test("password reset by email", async ({ browser }) => {
    // A dedicated account per run: Supabase allows one auth email per address per 60 s, and the magic-link test
    // above has just emailed the shared demo teammate. A fresh address keeps this test independent of ordering
    // without touching the app's own rate limits.
    const email = `reset.${Date.now()}@layer2funnels.test`;
    const sb = admin();
    const { data: created, error } = await sb.auth.admin.createUser({ email, password: "original-pass-1", email_confirm: true });
    if (error) throw error;
    const id = created.user.id;
    try {
      // accounts created outside an invite start with no access; activate it as an admin would
      await sb.from("workspace_members").update({ active: true }).eq("user_id", id);
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await ctx.newPage();
      await page.goto("/reset-password");
      await page.getByLabel("Email").fill(email);
      const sent = Date.now();
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("status")).toContainText("reset link is on its way");
      const mail = await latestMail(email, sent);
      expect(mail.Subject).toContain("Reset");
      const href = mail.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)![1].replace(/&amp;/g, "&");
      const url = new URL(href);
      await page.goto(url.pathname + url.search);
      await expect(page).toHaveURL(/\/update-password/);
      await page.getByLabel("New password").fill("a-brand-new-pass-1");
      await page.getByLabel("Confirm password").fill("a-brand-new-pass-1");
      await page.getByRole("button", { name: "Save password" }).click();
      await expect(page).toHaveURL("/");
      await ctx.close();
      // the new password works and the old one doesn't
      const { ctx: c2, page: p2 } = await signIn(browser, email, "a-brand-new-pass-1");
      await expect(p2).toHaveURL("/");
      await c2.close();
      const { ctx: c3, page: p3 } = await signIn(browser, email, "original-pass-1");
      await expect(p3.locator('form p[role="alert"]')).toBeVisible();
      await expect(p3).toHaveURL(/\/login/);
      await c3.close();
    } finally {
      await sb.auth.admin.deleteUser(id);
    }
  });
});
