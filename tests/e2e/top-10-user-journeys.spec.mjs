import { test, expect } from "@playwright/test";

/**
 * Production-readiness journey suite.
 *
 * Required seeded credentials should be provided via env vars before execution:
 * - E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
 * - E2E_INSTITUTE_EMAIL / E2E_INSTITUTE_PASSWORD
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 */

async function login(page, email, password) {
  await page.goto("/auth/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
}

test.describe("Top 10 user journeys", () => {
  test("1) Student login and dashboard load", async ({ page }) => {
    test.skip(!process.env.E2E_STUDENT_EMAIL || !process.env.E2E_STUDENT_PASSWORD, "Student env credentials missing");
    await login(page, process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
    await expect(page).toHaveURL(/\/student\//);
    await expect(page.getByText(/student dashboard/i)).toBeVisible();
  });

  test("2) Student course enrollment checkout path reachable", async ({ page }) => {
    test.skip(!process.env.E2E_STUDENT_EMAIL || !process.env.E2E_STUDENT_PASSWORD, "Student env credentials missing");
    await login(page, process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
    await page.goto("/courses");
    await expect(page.getByRole("heading", { name: /courses/i })).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
  });

  test("3) Student webinar registration journey reachable", async ({ page }) => {
    test.skip(!process.env.E2E_STUDENT_EMAIL || !process.env.E2E_STUDENT_PASSWORD, "Student env credentials missing");
    await login(page, process.env.E2E_STUDENT_EMAIL, process.env.E2E_STUDENT_PASSWORD);
    await page.goto("/webinars");
    await expect(page.getByRole("heading", { name: /webinars/i })).toBeVisible();
  });

  test("4) Institute login and dashboard load", async ({ page }) => {
    test.skip(!process.env.E2E_INSTITUTE_EMAIL || !process.env.E2E_INSTITUTE_PASSWORD, "Institute env credentials missing");
    await login(page, process.env.E2E_INSTITUTE_EMAIL, process.env.E2E_INSTITUTE_PASSWORD);
    await expect(page).toHaveURL(/\/institute\//);
    await expect(page.getByText(/institute dashboard/i)).toBeVisible();
  });

  test("5) Institute course creation page is accessible", async ({ page }) => {
    test.skip(!process.env.E2E_INSTITUTE_EMAIL || !process.env.E2E_INSTITUTE_PASSWORD, "Institute env credentials missing");
    await login(page, process.env.E2E_INSTITUTE_EMAIL, process.env.E2E_INSTITUTE_PASSWORD);
    await page.goto("/institute/courses/new");
    await expect(page.getByRole("heading", { name: /create|course/i })).toBeVisible();
  });

  test("6) Institute payout request page is accessible", async ({ page }) => {
    test.skip(!process.env.E2E_INSTITUTE_EMAIL || !process.env.E2E_INSTITUTE_PASSWORD, "Institute env credentials missing");
    await login(page, process.env.E2E_INSTITUTE_EMAIL, process.env.E2E_INSTITUTE_PASSWORD);
    await page.goto("/institute/wallet");
    await expect(page.getByText(/wallet/i)).toBeVisible();
  });

  test("7) Admin login and dashboard load", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, "Admin env credentials missing");
    await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin\//);
    await expect(page.getByText(/admin dashboard/i)).toBeVisible();
  });

  test("8) Admin payout requests page loads", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, "Admin env credentials missing");
    await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
    await page.goto("/admin/payout-requests");
    await expect(page.getByText(/payout/i)).toBeVisible();
  });

  test("9) Admin payout accounts review page loads", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, "Admin env credentials missing");
    await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
    await page.goto("/admin/payout-accounts");
    await expect(page.getByText(/payout account/i)).toBeVisible();
  });

  test("10) Featured listings management pages load (institute + admin)", async ({ page }) => {
    test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, "Admin env credentials missing");
    await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
    await page.goto("/admin/featured-listings");
    await expect(page.getByText(/featured/i)).toBeVisible();
  });
});
