import { expect, test } from "@playwright/test";

// States board: a missing or unavailable record says so plainly, says what to do, and looks the same whether it never existed
// or belongs to someone else (nothing leaks), always with a 404 status.
const GHOST = "00000000-0000-4000-8000-0000000000ff";

test("a client that is not in your workspace shows one clear message with a way back", async ({ page }) => {
  const res = await page.goto(`/clients/${GHOST}`);
  expect(res!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "You don’t have access to this" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to clients" })).toBeVisible();
});

test("an unknown address outside the app shell gets the standalone page with a way home", async ({ page }) => {
  const res = await page.goto(`/funnels/${GHOST}`);
  expect(res!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page isn’t available" })).toBeVisible();
  await page.getByRole("link", { name: "Go to home" }).click();
  await expect(page).toHaveURL(/\/$/);
});
