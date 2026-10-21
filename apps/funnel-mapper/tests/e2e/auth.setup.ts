import { expect, test as setup } from "@playwright/test";

setup("sign in as the demo user", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@layer2funnels.test");
  await page.getByLabel("Password").fill("demo-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  // most specs work in the full details panel; it starts collapsed to a rail for new users (calm.spec covers that default)
  await page.evaluate(() => localStorage.setItem("fm-editor-opts", JSON.stringify({ hideInsp: false })));
  await page.context().storageState({ path: "tests/e2e/.auth/demo.json" });
});
