import bcrypt from "bcryptjs";
import { CATEGORY_SEED, prisma } from "../src/index";

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

  // Expense categories (SM-99) — must exist before any VendorRule/Expense references them (FK).
  for (const c of CATEGORY_SEED) {
    await prisma.category.upsert({
      where: { key: c.key },
      update: { label: c.label, system: c.system, kind: c.kind, sortOrder: c.sortOrder },
      create: c,
    });
  }

  // Starter VendorRules for CARD_TX auto-categorization (§4.2, SM-51). go-live extends these.
  const rules: { pattern: string; category: "FUEL" | "OPERATIONS"; vendor?: string }[] = [
    { pattern: "PETROL", category: "FUEL", vendor: "Makpetrol" },
    { pattern: "MAKPETROL", category: "FUEL", vendor: "Makpetrol" },
    { pattern: "LUKOIL", category: "FUEL", vendor: "Lukoil" },
    { pattern: "K.VODA", category: "FUEL", vendor: "BP" },
    { pattern: "OKTA", category: "FUEL" },
  ];
  for (const r of rules) {
    const existing = await prisma.vendorRule.findFirst({ where: { pattern: r.pattern } });
    if (!existing)
      await prisma.vendorRule.create({
        data: { pattern: r.pattern, category: r.category, vendor: r.vendor ?? null },
      });
  }

  console.log(
    `Seeded: user ${email} (password: ${password}), period ${period}, NLB account, ${rules.length} vendor rules.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
