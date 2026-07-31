import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Playwright globalSetup — provision a dedicated, seeded `smetko_e2e` database (create → migrate →
 * seed) before the app boots. The seed provisions the login user the auth spec uses. Loaded by
 * Playwright as CommonJS, so it uses __dirname (not import.meta).
 */
const E2E_DB = "smetko_e2e";
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  `postgresql://smetko:smetko@localhost:5434/${E2E_DB}?schema=public`;
const repoRoot = path.resolve(__dirname, "../../..");
const schema = path.join(repoRoot, "packages/db/prisma/schema.prisma");
const seed = path.join(repoRoot, "packages/db/prisma/seed.ts");

export default async function globalSetup() {
  const exists = execSync(
    `docker compose exec -T db psql -U smetko -d smetko -tAc "SELECT 1 FROM pg_database WHERE datname='${E2E_DB}'"`,
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  if (exists !== "1") {
    execSync(`docker compose exec -T db psql -U smetko -d smetko -c "CREATE DATABASE ${E2E_DB}"`, {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }

  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL };
  execSync(`npx prisma migrate deploy --schema "${schema}"`, {
    cwd: repoRoot,
    stdio: "inherit",
    env,
  });
  execSync(`npx tsx "${seed}"`, { cwd: repoRoot, stdio: "inherit", env });
}
