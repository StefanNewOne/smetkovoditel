import { prisma } from "@smetko/db";

/**
 * Per-test DB isolation for the integration suite. resetDb() truncates every table (CASCADE,
 * identity reset) and re-seeds the minimal baseline every workflow needs: an open Period and a
 * test user (actor for AuditLog). Call it in beforeEach. Returns the baseline ids.
 */
export { prisma };
export const TEST_PERIOD = "2026-07";

export interface Baseline {
  userId: string;
  period: string;
}

export async function seedBaseline(): Promise<Baseline> {
  const user = await prisma.user.create({
    data: {
      name: "Тест Корисник",
      email: "test@godigital.com.mk",
      role: "admin",
      passwordHash: "x",
    },
  });
  await prisma.period.create({ data: { id: TEST_PERIOD, status: "OPEN" } });
  // The АЛМА ДИЗАЈН NLB account (D1) — statement ingest resolves lines against it.
  await prisma.bankAccount.create({
    data: {
      bank: "NLB",
      accountNumber: "210-0768360001-38",
      openingBalance: 0,
      openingDate: new Date(Date.UTC(2026, 6, 1)),
    },
  });
  return { userId: user.id, period: TEST_PERIOD };
}

export async function resetDb(): Promise<Baseline> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length > 0) {
    const list = tables.map((t) => `"${t.tablename}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }
  return seedBaseline();
}
