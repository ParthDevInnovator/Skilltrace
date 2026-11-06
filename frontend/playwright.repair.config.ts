import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: 'redesign-repair.spec.ts', workers: 1,
  timeout: 45000, expect: { timeout: 10000 },
  use: { baseURL: 'http://127.0.0.1:5181', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge' } },
    { name: 'mobile', use: { ...devices['Desktop Chrome'], channel: 'msedge', viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: '"..\\.venv\\Scripts\\python.exe" -m uvicorn backend.tests.browser_app:app --app-dir .. --host 127.0.0.1 --port 8011', url: 'http://127.0.0.1:8011/health', reuseExistingServer: false,
      env: { DEBUG: 'false', ENVIRONMENT: 'e2e', CLERK_SECRET_KEY: '', E2E_BOOTSTRAP_USERS: 'true', JWT_SECRET: 'redesign-offline-test-secret-at-least-32-chars', DATABASE_URL: 'sqlite+aiosqlite:///./.e2e-redesign.db' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort', url: 'http://127.0.0.1:5181', reuseExistingServer: false,
      env: { VITE_CLERK_PUBLISHABLE_KEY: '', API_PROXY_TARGET: 'http://127.0.0.1:8011' } },
  ],
})
