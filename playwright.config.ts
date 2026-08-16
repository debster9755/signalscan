import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration — PRD §26.3.
 *
 * `testDir` is the load-bearing line. Without a config file at all, Playwright
 * defaults its test directory to the repository root, discovers the 304 vitest
 * unit tests by their `.test.ts` suffix, and dies trying to run them as browser
 * tests ("Vitest failed to access its internal state"). Scoping it to
 * `tests/e2e` keeps the two runners out of each other's way.
 *
 * There is no `webServer` block yet because there is no application to serve —
 * `apps/web` (§14) is the next milestone. It goes here when that lands.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // A committed `.only` silently narrows the suite to one test; in CI that is a
  // green run that proved nothing.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
