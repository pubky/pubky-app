import { defineConfig, devices } from '@playwright/test';

// Proof-of-concept suite. Cypress and the Vitest browser runner are unchanged.
// IndexedDB keys are non-extractable, so nothing here uses storageState: each test signs in
// through the UI (onboarding, or a recovery file the shared seed writes).
// serviceWorkers: 'block' keeps the Serwist worker from hiding requests from page.route.
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results';
const reportDir = process.env.PLAYWRIGHT_HTML_REPORT || 'playwright-report';

export default defineConfig({
  testDir: './playwright/e2e',
  outputDir,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: reportDir }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    serviceWorkers: 'block',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
});
