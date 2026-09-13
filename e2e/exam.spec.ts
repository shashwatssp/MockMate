import { expect, test } from '@playwright/test';

/**
 * E2E smoke suite (Phase 5.2) — the exam path and the surfaces around it.
 *
 * Always-run specs verify the app boots and its main gates work:
 *   1. landing → teacher sign-in → dashboard renders
 *   2. student register → join-by-code → awaiting-approval screen
 *
 * The full exam spec (entry → exam → submit → results) runs only when
 * SMOKE_TEST_KEY names a real, open test in the configured Supabase project:
 *
 *   SMOKE_TEST_KEY=AB12 npx playwright test e2e/exam.spec.ts
 */

const DEMO_TEACHER = {
  username: '1234',
  password: 'Testing',
};

const uniqueEmail = () =>
  `e2e-${Date.now()}-${Math.floor(Math.random() * 10_000)}@mockmate.test`;

test.describe('app boots and auth gates work', () => {
  test('landing renders and teacher can sign in to the dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Mock/i).first()).toBeVisible();

    await page.goto('/login');
    await page.getByPlaceholder(/Username/i).fill(DEMO_TEACHER.username);
    await page.locator('input[type="password"]').first().fill(DEMO_TEACHER.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // Dashboard is up when the tests header (or the new-teacher empty state)
    // is visible.
    await expect(
      page.getByText(/Your Tests|No tests created yet/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('student can register and reaches the awaiting-approval screen', async ({ page }) => {
    const email = uniqueEmail();
    await page.goto('/student/register');

    await page.getByPlaceholder('Aarav Sharma').fill('E2E Smoke');
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill('e2e-password');

    await page.getByRole('button', { name: /sign up|register/i }).click();

    // Registration → sign in with the fresh account.
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill('e2e-password');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(
      page.getByText(/awaiting approval|added to batch|account has been created/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('exam path', () => {
  test('entry → exam → submit → results', async ({ page }) => {
    const testKey = process.env.SMOKE_TEST_KEY;
    test.skip(!testKey, 'Set SMOKE_TEST_KEY to a live test key to run the exam path.');

    await page.goto(`/exam/${testKey!}/entry`);

    // Practice vs credit doesn't matter for the smoke — just get through.
    await page.getByPlaceholder(/full name/i).fill('E2E Smoke');
    await page.getByPlaceholder(/email/i).fill(uniqueEmail());
    await page.getByText(/terms and conditions/i).click();
    await page.getByRole('button', { name: /start/i }).click();

    // Exam active: answer the first question, then submit through the flow.
    await expect(page.getByText(/question/i).first()).toBeVisible({ timeout: 30_000 });
    await page.locator('.question-option, label:has(input[type="radio"])').first().click();
    await page.getByRole('button', { name: /submit/i }).first().click();
    // Confirm dialog (confirmSubmit default true).
    const confirmButton = page.getByRole('button', { name: /confirm|submit/i }).last();
    if (await confirmButton.isVisible().catch(() => false)) {
      await confirmButton.click();
    }

    await expect(
      page.getByText(/score|percent|correct/i).first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
