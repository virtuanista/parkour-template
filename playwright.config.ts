import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', timeout: 90_000, workers: 1,
  use: { baseURL: 'http://localhost:4173', channel: 'chrome', viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
});
