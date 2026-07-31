import { expect, test } from "@playwright/test";

/**
 * The Master Plan "whole monthly cycle by hand" path starts at authentication. This proves the
 * seeded user can log in and reach the dashboard, and that a bad credential is rejected — the
 * gate every other screen sits behind.
 */
test("valid credentials log in and land on the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "kekic@godigital.com.mk");
  await page.fill('input[name="password"]', "smetko-dev");
  await page.click('button:has-text("Најави се")');
  await page.waitForURL("**/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("invalid credentials are rejected", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[name="email"]', "kekic@godigital.com.mk");
  await page.fill('input[name="password"]', "wrong-password");
  await page.click('button:has-text("Најави се")');
  await expect(page.getByText("Погрешна е-пошта или лозинка.")).toBeVisible();
});
