import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb } from "./setup/db";

/**
 * Harness smoke test: proves the integration suite reaches a real Postgres, the schema is
 * migrated, resetDb() truncates + re-seeds, and the `@smetko/db` singleton is bound to the test
 * database (never `smetko`). If this fails, no other integration test is trustworthy.
 */
describe("integration harness", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("is bound to the smetko_test database, not smetko", async () => {
    const rows = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
    expect(rows[0]?.current_database).toBe("smetko_test");
  });

  it("seeds the baseline period + user and reads them back", async () => {
    const period = await prisma.period.findUnique({ where: { id: "2026-07" } });
    expect(period?.status).toBe("OPEN");
    const users = await prisma.user.count();
    expect(users).toBe(1);
  });

  it("creates and reads a client (round-trip through Prisma)", async () => {
    const c = await prisma.client.create({
      data: { name: "Smoke Client", paymentChannel: "INVOICE", taxId: "1234567890123" },
    });
    const back = await prisma.client.findUnique({ where: { id: c.id } });
    expect(back?.name).toBe("Smoke Client");
  });

  it("resetDb() wipes rows between tests (no client leaked from the previous test)", async () => {
    expect(await prisma.client.count()).toBe(0);
  });
});
