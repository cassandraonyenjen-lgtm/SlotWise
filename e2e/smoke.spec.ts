import { expect, test } from "@playwright/test";

test("landing page links to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Share one link");
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in to Slotwise" })).toBeVisible();
});

test("dashboard requires sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("reserved usernames are not booking pages", async ({ page }) => {
  const res = await page.goto("/settings");
  expect(res?.status()).toBe(404);
});

test("public booking page placeholder renders", async ({ page }) => {
  await page.goto("/jane/intro-call");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("jane / intro-call");
});
