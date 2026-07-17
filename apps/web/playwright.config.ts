import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * E2E config (WP9). Boots `next dev` against a dedicated, seeded `smetko_e2e` Postgres (created by
 * ./e2e/global-setup.ts) so the login → dashboard flow runs against real data. Bring the DB up
 * first: `docker compose up -d db`, then `npm run test:e2e` (needs `npx playwright install chromium`).
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  "postgresql://smetko:smetko@localhost:5434/smetko_e2e?schema=public";
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: path.join(__dirname, "e2e/global-setup.ts"),
  timeout: 30_000,
  fullyParallel: false,
  reporter: "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      SESSION_SECRET: "e2e-session-secret-at-least-32-characters-long",
      CRON_SECRET: "e2e-cron-secret",
    },
  },
});
