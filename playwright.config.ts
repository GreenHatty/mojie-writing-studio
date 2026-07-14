import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // Vinext's development server can reset the socket while three projects
  // request newly generated lazy chunks at the same time.  Browser coverage is
  // intentionally serialized; production performance is measured separately.
  workers: 1,
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: process.env.CI ? undefined : 'msedge' },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }
  ]
});
