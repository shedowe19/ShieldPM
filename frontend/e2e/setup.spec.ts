import { test, expect } from "@playwright/test";

/**
 * E2E tests for the initial Setup wizard.
 *
 * This suite MUST run before the login tests (it runs first alphabetically
 * because "setup" < "login" is false — Playwright sorts files, so we prefix
 * nothing; the webServer starts with a fresh DB each run via
 * DB_SQLITE_FILE=./data/e2e-test.sqlite).
 *
 * The setup wizard is shown when no users exist in the database.
 * It creates the first admin user via POST /api/users.
 */

const ADMIN_NAME = "E2E Admin";
const ADMIN_EMAIL = "admin@shieldpm.test";
const ADMIN_PASSWORD = "TestPassword123!";

test.describe("Initial Setup", () => {
  test("should show setup wizard when no users exist", async ({ page }) => {
    // When the DB is empty the app redirects to /setup
    await page.goto("/");

    // Either we land on /setup or the health check triggers a redirect
    await page.waitForURL(/setup/, { timeout: 15000 });

    // The setup card should be visible with name, email, and password fields
    await expect(page.locator("#name")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("should show validation errors for empty submission", async ({
    page,
  }) => {
    await page.goto("/setup");

    // Touch fields then blur to trigger Formik validation
    await page.locator("#name").click();
    await page.locator("#email").click();
    await page.locator("#password").click();
    await page.locator("#name").click(); // blur password

    // Formik field-level errors
    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("should reject invalid email format", async ({ page }) => {
    await page.goto("/setup");

    await page.locator("#name").fill("Test User");
    await page.locator("#email").fill("not-an-email");
    await page.locator("#email").blur();

    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("should reject short password (< 8 chars)", async ({ page }) => {
    await page.goto("/setup");

    await page.locator("#password").fill("short");
    await page.locator("#password").blur();

    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 3000,
    });
  });

  test("should create admin user and auto-login", async ({ page }) => {
    await page.goto("/setup");

    await page.locator("#name").fill(ADMIN_NAME);
    await page.locator("#email").fill(ADMIN_EMAIL);
    await page.locator("#password").fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    // After successful setup the app should navigate away from /setup
    // (typically to the dashboard or login page)
    await expect(page).not.toHaveURL(/\/setup/, { timeout: 15000 });
  });
});
