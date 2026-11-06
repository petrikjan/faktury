import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3199',
    browserName: 'chromium',
    channel: process.env.PDF_BROWSER_CHANNEL === 'chromium' ? undefined : 'chrome',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx tests/e2e-server.ts',
    url: 'http://127.0.0.1:3199/health/ready',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
