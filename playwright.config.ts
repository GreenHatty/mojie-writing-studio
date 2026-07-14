import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // Browser coverage is serialized so offline toggles and performance traces
  // cannot influence another project. The production server avoids Vinext dev
  // prebundle reloads invalidating later device runs.
  workers: 1,
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure', screenshot: 'only-on-failure', channel: process.env.CI ? undefined : 'msedge' },
  webServer: {
    command: 'npm run build && npm run start -- --hostname 0.0.0.0 --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } } },
    { name: 'mobile-390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } }
  ]
});
