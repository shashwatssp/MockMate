import { defineConfig } from '@playwright/test';

/**
 * E2E smoke suite (Phase 5.2).
 *
 * One-time setup:  npx playwright install chromium
 * Run:             npm run test:e2e
 *
 * The webServer block boots the Vite dev server automatically. The full
 * exam-path spec (entry → exam → submit → results) needs a real test key in
 * the configured Supabase project — provide it via SMOKE_TEST_KEY; the spec
 * skips itself when the variable is absent so `npm run test:e2e` always works.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    viewport: { width: 390, height: 844 }, // phone-first: students live here
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5173 --strictPort',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
