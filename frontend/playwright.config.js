const { defineConfig, devices } = require('@playwright/test');

// Cross-device / cross-engine UI audit. Each spec runs across every project below.
const DESKTOP = { width: 1440, height: 900 };

module.exports = defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./e2e/global-setup'),
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/results.json' }],
    ['html', { open: 'never', outputFolder: 'e2e/report' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'BROWSER=none yarn start',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180000,
  },
  projects: [
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: DESKTOP } },
    { name: 'chromium-tablet', use: { browserName: 'chromium', viewport: { width: 820, height: 1180 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 5'] } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: DESKTOP } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 13'] } },
    { name: 'firefox-desktop', use: { browserName: 'firefox', viewport: DESKTOP } },
  ],
});
