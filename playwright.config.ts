import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4178';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'pnpm --filter @workspace/cantinas-nexus exec vite --config vite.config.ts --host 127.0.0.1 --port 4178 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      BASE_PATH: '/',
      VITE_SUPABASE_URL: 'https://e2e.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'e2e-anon-key-not-valid-outside-tests',
    },
  },
});
