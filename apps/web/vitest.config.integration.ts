import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// Integration tests run against a REAL Postgres (the Docker compose `db` service) on a dedicated
// `smetko_test` database — matches CLAUDE.md Cat 6 ("Real PostgreSQL (Docker)"). Bring the stack
// up first: `docker compose up -d db && npm run test:integration`.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://smetko:smetko@localhost:5434/smetko_test?schema=public";

export default defineConfig({
  test: {
    include: ["test/**/*.integration.test.ts", "lib/**/*.integration.test.ts"],
    globalSetup: ["./test/setup/global-setup.ts"],
    // Serialize: every test shares one Postgres; resetDb() truncates between tests.
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    hookTimeout: 120_000,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: "test",
      SESSION_SECRET: "test-session-secret-at-least-32-characters-long",
      CRON_SECRET: "test-cron-secret",
    },
  },
  resolve: {
    alias: [
      // `server-only` guard → no-op in Node (see stub).
      { find: /^server-only$/, replacement: here("./test/stubs/server-only.ts") },
      // Workspace packages → their TS source (main = src/index.ts).
      { find: /^@smetko\/db$/, replacement: here("../../packages/db/src/index.ts") },
      { find: /^@smetko\/shared$/, replacement: here("../../packages/shared/src/index.ts") },
      // App path alias `@/x` → apps/web/x (mirrors tsconfig "@/*": ["./*"]).
      { find: /^@\/(.*)$/, replacement: here("./$1") },
    ],
  },
});
