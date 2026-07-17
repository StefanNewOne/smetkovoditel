import { prisma } from "@smetko/db";

/**
 * Test data factories. Amounts are integer денари (B10): 30.000,00 MKD → 3_000_000. Packages are
 * effective from well before the test period so W1 picks them up.
 */
const PKG_FROM = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01

export async function createInvoiceClient(opts: {
  userId: string;
  monthlyAmount: number;
  creditBalance?: number;
  name?: string;
  contactEmail?: string | null;
}) {
  return prisma.client.create({
    data: {
      name: opts.name ?? "Invoice Client",
      taxId: "4032023558371",
      paymentChannel: "INVOICE",
      vatApplicable: true,
      contactEmail: opts.contactEmail === undefined ? "client@client.test" : opts.contactEmail,
      creditBalance: opts.creditBalance ?? 0,
      packages: {
        create: {
          monthlyAmount: opts.monthlyAmount,
          description: "Месечен пакет",
          effectiveFrom: PKG_FROM,
          createdById: opts.userId,
        },
      },
    },
  });
}

export async function createCashClient(opts: {
  userId: string;
  monthlyAmount: number;
  creditBalance?: number;
  name?: string;
}) {
  return prisma.client.create({
    data: {
      name: opts.name ?? "Cash Client",
      paymentChannel: "CASH",
      vatApplicable: false,
      creditBalance: opts.creditBalance ?? 0,
      packages: {
        create: {
          monthlyAmount: opts.monthlyAmount,
          description: "Месечен пакет (кеш)",
          effectiveFrom: PKG_FROM,
          createdById: opts.userId,
        },
      },
    },
  });
}

export async function addActorsLineTemplate(clientId: string) {
  return prisma.recurringLineTemplate.create({
    data: { clientId, type: "ACTORS", active: true, billingMode: "PASSTHROUGH_ACTUAL" },
  });
}

export async function createTalentContractor(name = "Актер Тест") {
  return prisma.contractor.create({
    data: {
      name,
      contractType: "DOGOVOR_NA_DELO",
      taxMode: "WITHHOLD_10",
      isTalent: true,
    },
  });
}

/** Put money into the blagajna so cash-OUT flows have a positive balance (B3). */
export async function fundBlagajna(amount: number, userId: string, period = "2026-07") {
  return prisma.cashLedgerEntry.create({
    data: {
      direction: "IN",
      amount,
      date: new Date(),
      description: "Почетно салдо (тест)",
      counterpartyType: "INTERNAL",
      documentType: "FISCAL",
      documentNumber: "TEST-OPENING",
      periodId: period,
      createdById: userId,
    },
  });
}
