import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests drive the production server (built SPA + API on one port), so run
 * `npm run build` first. The database must be running and populated — in CI
 * the workflow seeds it from test/fixtures/export via the import tools.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:5178/api/summary',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
