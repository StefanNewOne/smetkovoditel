import bcrypt from "bcryptjs";
import { prisma } from "../src/index";

/**
 * Phase 0 seed: one admin user, the current open Period, and the АЛМА ДИЗАЈН bank account (D1).
 * Idempotent — safe to run repeatedly. Real go-live data (clients, balances, last invoice
 * number) is entered via the wizard / go-live checklist, not seeded.
 */
async function main() {
  const email = "kekic@godigital.com.mk";
  const password = "smetko-dev"; // dev-only; change on first login in real deployments.

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: "Александар Кекиќ",
      email,
      role: "admin",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  const period = "2026-07";
  await prisma.period.upsert({
    where: { id: period },
    update: {},
    create: { id: period, status: "OPEN" },
  });

  await prisma.bankAccount.upsert({
    where: { accountNumber: "210-0768360001-38" }, // D1
    update: {},
    create: {
      bank: "NLB",
      accountNumber: "210-0768360001-38",
      openingBalance: 0, // set from the last real statement at go-live (§12.5)
      openingDate: new Date("2026-07-01T00:00:00Z"),
    },
  });

  console.log(`Seeded: user ${email} (password: ${password}), period ${period}, NLB account.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
