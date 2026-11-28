import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import { ADMIN } from './e2e/app';

// The built server with the built web app, as in production: `pnpm build` first.
const PORT = 3310;
const DATA_DIR = resolve('.e2e-data');

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    // A fresh database each run; the admin comes from env, no setup wizard.
    command: `rm -rf "${DATA_DIR}" && node apps/server/dist/index.js`,
    url: `http://localhost:${PORT}/api/config`,
    reuseExistingServer: false,
    env: {
      DATA_DIR,
      WEB_DIST: resolve('apps/web/dist'),
      PORT: String(PORT),
      HOST: '127.0.0.1',
      // http on localhost: cookies without Secure, the service worker still runs.
      PUBLIC_URL: `http://localhost:${PORT}`,
      AUTH_METHODS: 'password',
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
    },
  },
});
