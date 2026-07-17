import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Vitest globalSetup (runs once before the integration suite). Ensures a dedicated `smetko_test`
 * database exists on the Docker compose `db` service and applies the committed migrations to it.
 * The real `smetko` database is never touched. Per-test isolation is handled by resetDb() in
 * ./db.ts.
 */
const TEST_DB = "smetko_test";
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://smetko:smetko@localhost:5434/${TEST_DB}?schema=public`;

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const schema = fileURLToPath(
  new URL("../../../../packages/db/prisma/schema.prisma", import.meta.url),
);

export async function setup() {
  const psql = (sql: string, db = "smetko") =>
    execSync(`docker compose exec -T db psql -U smetko -d ${db} -tAc "${sql}"`, {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

  // 1. Create the test database if it does not exist (idempotent).
  const exists = psql(`SELECT 1 FROM pg_database WHERE datname='${TEST_DB}'`);
  if (exists !== "1") {
    execSync(`docker compose exec -T db psql -U smetko -d smetko -c "CREATE DATABASE ${TEST_DB}"`, {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }

  // 2. Apply migrations to the test DB (schema is the source of truth — Cat 8).
  execSync(`npx prisma migrate deploy --schema "${schema}"`, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
