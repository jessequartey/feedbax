import { defineConfig, devices } from '@playwright/test'
import { e2eAuth } from './playwright.e2e.config.js'

const sessionSecret = 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk'

export default defineConfig({
  testDir: './tests/notion-smoke',
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3200',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'notion-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'pnpm --filter @feedbax/config build && pnpm --filter @feedbax/portal exec vite dev --port 3200',
    cwd: '.',
    url: 'http://localhost:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      FEEDBAX_PUBLIC_URL: 'http://localhost:3200',
      FEEDBAX_AUTH_AUDIENCE: e2eAuth.audience,
      FEEDBAX_AUTH_LOGIN_URL: 'https://notion-smoke.example/login',
      FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID: 'smoke-session',
      FEEDBAX_AUTH_ISSUERS: JSON.stringify([
        {
          issuer: e2eAuth.issuer,
          keys: [{ id: e2eAuth.keyId, secret: e2eAuth.handoffSecret }],
        },
      ]),
      FEEDBAX_AUTH_SESSION_KEYS: JSON.stringify([
        { id: 'smoke-session', secret: sessionSecret },
      ]),
    },
  },
})
