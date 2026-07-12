import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: process.env.CI ? undefined : 'msedge' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }
  ]
});
