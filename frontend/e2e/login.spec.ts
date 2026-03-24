import { test, expect } from "@playwright/test";

/**
 * E2E tests for the Login page.
 *
 * Prerequisites: the setup wizard must have been completed so that at least
 * one admin user exists. The "setup.spec.ts" suite (which runs first
 * alphabetically) takes care of that by creating:
 *   email:    admin@shieldpm.test
 *   password: TestPassword123!
 */

const TEST_ADMIN_EMAIL = "admin@shieldpm.test";
const TEST_ADMIN_PASSWORD = "TestPassword123!";

test.describe("Login", () => {
  test("should show login page with form elements", async ({ page }) => {
    await page.goto("/login");

    // The card title uses a locale key "login.title" — match generically
    await expect(
      page.locator(".card-title, [class*=CardTitle]").first(),
    ).toBeVisible();

    // Email and password inputs are rendered with ids by Formik
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();

    // Submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("should show validation errors for empty fields", async ({ page }) => {
    await page.goto("/login");

    // Touch email then blur to trigger Formik validation
    await page.locator("#email").click();
    await page.locator("#password").click();
    await page.locator("#email").click(); // blur password

    // Formik renders <p class="text-sm text-destructive"> for field errors
    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("should reject password shorter than 8 characters", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.locator("#email").fill("user@example.com");
    await page.locator("#password").fill("short");
    await page.locator("#password").blur();

    // Password validation requires 8-255 chars
    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill("wrong@example.com");
    await page.locator("#password").fill("WrongPassword123!");
    await page.locator('button[type="submit"]').click();

    // The backend returns an error that gets displayed inside an Alert
    await expect(
      page.locator('[role="alert"], .alert, [class*="Alert"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("should login with valid credentials and redirect away from /login", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.locator("#email").fill(TEST_ADMIN_EMAIL);
    await page.locator("#password").fill(TEST_ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // After successful login the app navigates away from /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
  });

  test("should show loading spinner while submitting", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill(TEST_ADMIN_EMAIL);
    await page.locator("#password").fill(TEST_ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // The submit button shows a Loader2 spinner (animate-spin class)
    await expect(
      page.locator(".animate-spin").first(),
    ).toBeVisible({ timeout: 3000 });
  });
});
