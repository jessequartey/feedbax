import { defineConfig, devices } from '@playwright/test'

const handoffSecret = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc'
const sessionSecret = 'CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk'

export const e2eAuth = {
  issuer: 'https://e2e-host.example',
  audience: 'feedbax-e2e',
  keyId: 'e2e-handoff',
  handoffSecret,
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command:
      'pnpm turbo run build --filter=@feedbax/portal^... && pnpm --filter @feedbax/portal exec vite dev --port 3100',
    cwd: '.',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      FEEDBAX_CONNECTOR: 'mock',
      FEEDBAX_E2E: 'true',
      FEEDBAX_E2E_KEY: 'feedbax-e2e-control',
      FEEDBAX_AUTH_AUDIENCE: e2eAuth.audience,
      FEEDBAX_AUTH_LOGIN_URL: 'https://e2e-host.example/login',
      FEEDBAX_AUTH_ACTIVE_SESSION_KEY_ID: 'e2e-session',
      FEEDBAX_AUTH_ISSUERS: JSON.stringify([
        {
          issuer: e2eAuth.issuer,
          keys: [{ id: e2eAuth.keyId, secret: handoffSecret }],
        },
      ]),
      FEEDBAX_AUTH_SESSION_KEYS: JSON.stringify([
        { id: 'e2e-session', secret: sessionSecret },
      ]),
    },
  },
})
