import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

// The browser backend gets its own database at an absolute path. A relative SQLite URL would
// resolve against frontend/ for the server but against the repo root for the startup
// `alembic upgrade`, leaving the server on an unmigrated file.
const e2eDir = resolve(dirname(fileURLToPath(import.meta.url)), '../.test-tmp/e2e')
mkdirSync(e2eDir, { recursive: true })
// The browser suite signs in natively: its own Vite port, started without the Clerk key, so a
// developer's Clerk-enabled server on 5173 is never reused.
const DATABASE_URL = `sqlite+aiosqlite:///${resolve(e2eDir, 'browser.db').replaceAll('\\', '/')}`

export default defineConfig({ testDir: './e2e', workers: 2, fullyParallel: false, use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' }, projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'msedge' } }, { name: 'mobile', use: { ...devices['Desktop Chrome'], channel: 'msedge', viewport: { width: 390, height: 844 } } }], webServer: [{ command: '"..\\.venv\\Scripts\\python.exe" -m uvicorn backend.tests.browser_app:app --app-dir .. --host 127.0.0.1 --port 8000', url: 'http://127.0.0.1:8000/health', env: { DEBUG: 'false', ENVIRONMENT: 'e2e', AUTO_SEED_DB: 'true', E2E_BOOTSTRAP_USERS: 'true', JWT_SECRET: 'phase5-e2e-secret-at-least-32-characters', DATABASE_URL }, reuseExistingServer: !process.env.CI }, { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort', url: 'http://127.0.0.1:5174', env: { VITE_CLERK_PUBLISHABLE_KEY: '', VITE_E2E_NATIVE_AUTH: 'true' }, reuseExistingServer: !process.env.CI }] })
