import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 3001;
const API_ORIGIN = process.env.SANCHAY_API_ORIGIN ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /shell\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'pnpm --filter=@sanchay/api dev',
      cwd: '../..',
      url: `${API_ORIGIN}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        ...baseEnv,
        PORT: '3000',
        SANCHAY_APP_ENV: 'local',
        SANCHAY_APP_ROLE: 'api',
        SANCHAY_APP_ORIGIN: `http://localhost:${WEB_PORT}`,
        SANCHAY_CLIENT_IP_SOURCE: 'socket',
        SANCHAY_KEY_SERVICE: 'local',
        SANCHAY_PROVIDER_MODE_SMS: 'mailpit',
        SANCHAY_PROVIDER_MODE_EMAIL: 'mailpit',
        SANCHAY_MAILPIT_URL: MAILPIT_URL,
        SANCHAY_OTP_PER_IP_PER_HOUR: '1000',
      },
    },
    {
      command: 'pnpm start',
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...baseEnv,
        SANCHAY_PLATFORM_ARN: 'ARN-000000',
        SANCHAY_PLATFORM_ARN_VALID_TILL: '2099-12-31',
        SANCHAY_API_ORIGIN: API_ORIGIN,
        SANCHAY_APP_ORIGIN: '',
        SANCHAY_WWW_ORIGIN: '',
      },
    },
  ],
});
