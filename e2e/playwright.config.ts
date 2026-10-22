import { defineConfig, devices } from '@playwright/test';

const FRONT_URL = process.env.E2E_FRONT_URL ?? 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:5000/api/v1';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: FRONT_URL,
    // Recording from the first attempt slows the renderer enough to change
    // pointer event timing, which the drag-and-drop sensor is sensitive to.
    // Capture only on the retry, where the diagnostics are actually needed.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  metadata: {
    apiUrl: API_URL,
  },
});

export { FRONT_URL, API_URL };
