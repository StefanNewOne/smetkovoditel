import { beforeEach, describe, expect, it } from "vitest";
import { type ImportInput, importHistorical } from "@smetko/db";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * SM-79 bulk historical importer. Loads clients + monthly history with REAL invoice numbers,
 * payments and opening balances, idempotently. Verifies numbering continues from the imported max.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

function input(over: Partial<ImportInput> = {}): ImportInput {
  return {
    systemUserId: userId,
    clients: [
      {
        name: "Клиент А",
        taxId: "4030000000001",
        channel: "INVOICE",
        monthlyAmountMkd: 30000,
        contactEmail: "a@x.mk",
      },
      { name: "Клиент Б", channel: "CASH", monthlyAmountMkd: 20000 },
    ],
    charges: [
      {
        clientName: "Клиент А",
        period: "2026-01",
        invoiceNumber: "1-1/1-2026",
        baseMkd: 30000,
        vatMkd: 5400,
        totalMkd: 35400,
        paidMkd: 35400,
      },
      {
        clientName: "Клиент А",
        period: "2026-07",
        invoiceNumber: "1-66/7-2026",
        baseMkd: 30000,
        vatMkd: 5400,
        totalMkd: 35400,
        paidMkd: 0,
      },
      {
        clientName: "Клиент Б",
        period: "2026-07",
        baseMkd: 20000,
        vatMkd: 0,
        totalMkd: 20000,
        paidMkd: 20000,
      },
    ],
    openingBankMkd: 150000,
    openingBankDate: "2026-01-01",
    openingCashMkd: 5000,
    ...over,
  };
}

describe("dry-run", () => {
  it("validates and reports without writing", async () => {
    const r = await importHistorical(prisma, input(), { apply: false });
    expect(r.ok).toBe(true);
    expect(r.clientsCreated).toBe(2);
    expect(r.chargesCreated).toBe(3);
    expect(await prisma.client.count()).toBe(0); // nothing written
  });
});

describe("apply", () => {
  it("creates clients, periods, historical charges with REAL numbers, payments, balances", async () => {
    const r = await importHistorical(prisma, input(), { apply: true });
    expect(r.ok).toBe(true);
    expect(r.clientsCreated).toBe(2);
    expect(r.chargesCreated).toBe(3);
    expect(r.paymentsCreated).toBe(2); // Jan A + Jul Б

    const jul = await prisma.charge.findFirstOrThrow({ where: { invoiceNumber: "1-66/7-2026" } });
    expect(jul.seqInMonth).toBe(66);
    expect(jul.subtotal).toBe(3_000_000); // 30.000 MKD → денари
    expect(jul.vatAmount).toBe(540_000);
    expect(jul.total).toBe(3_540_000);
    expect(jul.status).toBe("OPEN");

    const cash = await prisma.charge.findFirstOrThrow({ where: { kind: "CASH_OBLIGATION" } });
    expect(cash.status).toBe("PAID");
    expect(cash.invoiceNumber).toBeNull();

    const bank = await prisma.bankAccount.findFirstOrThrow();
    expect(bank.openingBalance).toBe(15_000_000);
    const opening = await prisma.cashLedgerEntry.findFirstOrThrow({
      where: { documentNumber: "OPENING" },
    });
    expect(opening.amount).toBe(500_000);
  });

  it("continues W1 numbering from the imported maximum (66 → 67)", async () => {
    await importHistorical(prisma, input(), { apply: true });
    // A fresh invoice client in the same period; W1 must number it 1-67/7-2026.
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "Клиент В" });
    await generateCharges("2026-07", userId);
    const draft = await prisma.charge.findFirstOrThrow({ where: { status: "DRAFT" } });
    const { invoiceNumber } = await approveInvoice(draft.id, userId);
    expect(invoiceNumber).toBe("1-67/7-2026");
  });

  it("is idempotent — re-running skips existing clients and charges", async () => {
    await importHistorical(prisma, input(), { apply: true });
    const again = await importHistorical(prisma, input(), { apply: true });
    expect(again.clientsSkipped).toBe(2);
    expect(again.chargesSkipped).toBe(3);
    expect(again.chargesCreated).toBe(0);
    expect(await prisma.client.count()).toBe(2); // not 4
  });
});

describe("validation (aborts, writes nothing)", () => {
  it("rejects an INVOICE client without ЕДБ (B17)", async () => {
    const bad = input({
      clients: [{ name: "NoTax", channel: "INVOICE", monthlyAmountMkd: 30000 }],
      charges: [],
    });
    const r = await importHistorical(prisma, bad, { apply: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/ЕДБ|B17/);
    expect(await prisma.client.count()).toBe(0);
  });

  it("rejects base + vat ≠ total", async () => {
    const bad = input({
      charges: [
        {
          clientName: "Клиент А",
          period: "2026-01",
          invoiceNumber: "1-1/1-2026",
          baseMkd: 30000,
          vatMkd: 5400,
          totalMkd: 99999,
        },
      ],
    });
    const r = await importHistorical(prisma, bad, { apply: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/base\+vat/);
  });
});
