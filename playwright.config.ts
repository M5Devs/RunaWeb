import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
    // headless is default; add here if you want explicit setting:
    // headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // NOTE: webServer is intentionally removed. The CI workflow starts vite preview
  // as a background process and manages its PID and teardown. Playwright will
  // therefore connect to the already-running server at baseURL.
});
