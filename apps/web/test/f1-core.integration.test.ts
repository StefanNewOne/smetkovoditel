import { beforeEach, describe, expect, it } from "vitest";
import { zCreateContractor } from "@smetko/shared";
import { generateCharges, approveInvoice } from "@/lib/workflows/w1";
import { collectCash } from "@/lib/workflows/w3";
import { calcHonorar, payoutHonorar } from "@/lib/workflows/w5";
import { recordCashExpense } from "@/lib/workflows/w6";
import { prisma, resetDb } from "./setup/db";
import {
  addActorsLineTemplate,
  createInvoiceClient,
  createCashClient,
  createTalentContractor,
  fundBlagajna,
} from "./setup/factories";

const PERIOD = "2026-07";
let userId = "";

beforeEach(async () => {
  ({ userId } = await resetDb());
});

// ── W1: numbering, VAT, idempotency, credit (T9/T10, B1/B12/B18) ──────────────
describe("W1 — charge generation & invoice numbering", () => {
  it("T9: 30.000 → INVOICE DRAFT with 18% VAT = 35.400, numbered 1-{n}/7-2026 at approval", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });

    const gen = await generateCharges(PERIOD, userId);
    expect(gen.created).toBe(1);

    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    expect(charge.kind).toBe("INVOICE");
    expect(charge.status).toBe("DRAFT");
    expect(charge.subtotal).toBe(3_000_000);
    expect(charge.vatAmount).toBe(540_000); // 18%
    expect(charge.total).toBe(3_540_000); // 35.400,00
    expect(charge.invoiceNumber).toBeNull(); // no number before issuance (B1)

    const { invoiceNumber } = await approveInvoice(charge.id, userId);
    expect(invoiceNumber).toBe("1-1/7-2026");
    const approved = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(approved.status).toBe("OPEN");
    expect(approved.seqInMonth).toBe(1);
  });

  it("T10 / B12: CASH client → CASH_OBLIGATION, OPEN, no number, no VAT; one Charge per client/period/kind", async () => {
    await createCashClient({ userId, monthlyAmount: 3_000_000 });

    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({});
    expect(charge.kind).toBe("CASH_OBLIGATION");
    expect(charge.status).toBe("OPEN");
    expect(charge.vatAmount).toBe(0);
    expect(charge.invoiceNumber).toBeNull();

    // Idempotent re-run: no second charge (B12 @@unique[clientId, period, kind]).
    const again = await generateCharges(PERIOD, userId);
    expect(again.created).toBe(0);
    expect(again.skipped).toBe(1);
    expect(await prisma.charge.count()).toBe(1);
  });

  it("B1: sequential numbers with no gaps across multiple invoices", async () => {
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "A" });
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "B" });
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "C" });
    await generateCharges(PERIOD, userId);

    const drafts = await prisma.charge.findMany({ orderBy: { id: "asc" } });
    const numbers: string[] = [];
    for (const d of drafts) numbers.push((await approveInvoice(d.id, userId)).invoiceNumber);

    expect(numbers.sort()).toEqual(["1-1/7-2026", "1-2/7-2026", "1-3/7-2026"]);
    const seqs = (await prisma.charge.findMany({ select: { seqInMonth: true } }))
      .map((c) => c.seqInMonth)
      .sort();
    expect(seqs).toEqual([1, 2, 3]); // contiguous, no gaps
  });

  it("B18: creditBalance auto-applies at invoice approval", async () => {
    const client = await createInvoiceClient({
      userId,
      monthlyAmount: 3_000_000,
      creditBalance: 1_000_000, // 10.000,00 credit
    });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });

    await approveInvoice(charge.id, userId);
    const approved = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(approved.paidAmount).toBe(1_000_000);
    expect(approved.status).toBe("PARTIALLY_PAID"); // 1.000.000 < 3.540.000

    const after = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(after.creditBalance).toBe(0);
  });
});

// ── W3: cash collection atomicity + overpayment → credit (B18) ────────────────
describe("W3 — cash collection", () => {
  it("applies a fiscal cash receipt to a charge; overpayment goes to creditBalance", async () => {
    const client = await createCashClient({ userId, monthlyAmount: 1_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });

    // Pay 1.200.000 against a 1.000.000 obligation → 200.000 overpay → credit.
    await collectCash(
      { clientId: client.id, chargeId: charge.id, amount: 1_200_000, fiscalNumber: "FISC-001" },
      userId,
    );

    const paid = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(paid.paidAmount).toBe(1_000_000);
    expect(paid.status).toBe("PAID");
    const entry = await prisma.cashLedgerEntry.findFirstOrThrow({ where: { direction: "IN" } });
    expect(entry.documentType).toBe("FISCAL");
    expect(entry.documentNumber).toBe("FISC-001");
    const after = await prisma.client.findUniqueOrThrow({ where: { id: client.id } });
    expect(after.creditBalance).toBe(200_000);
  });
});

// ── W6: mobile cash expense — photo gate (B5) + never-negative (B3), atomic ────
describe("W6 — cash expense", () => {
  it("T11: records Expense + CashLedgerEntry(OUT) atomically when a photo is present", async () => {
    await fundBlagajna(1_000_000, userId);
    await recordCashExpense(
      {
        amount: 500_000,
        category: "FUEL",
        description: "Гориво",
        vendor: "Makpetrol",
        attachmentUrl: "https://s3.local/photo.jpg",
      },
      userId,
    );

    const expense = await prisma.expense.findFirstOrThrow({ where: { paymentChannel: "CASH" } });
    expect(expense.amount).toBe(500_000);
    expect(expense.isBillable).toBe(false);
    expect(expense.attachmentUrl).toBe("https://s3.local/photo.jpg");
    expect(expense.cashEntryId).not.toBeNull();
    const out = await prisma.cashLedgerEntry.findFirstOrThrow({ where: { direction: "OUT" } });
    expect(out.amount).toBe(500_000);
    expect(out.documentType).toBe("KASA_ISPLATI");
  });

  it("B5: a cash expense WITHOUT a photo is blocked and writes nothing", async () => {
    await fundBlagajna(1_000_000, userId);
    await expect(
      recordCashExpense(
        { amount: 100_000, category: "FUEL", description: "Без слика", attachmentUrl: "" },
        userId,
      ),
    ).rejects.toThrow();
    expect(await prisma.expense.count()).toBe(0);
    expect(await prisma.cashLedgerEntry.count({ where: { direction: "OUT" } })).toBe(0);
  });

  it("B3: a cash expense exceeding the balance is blocked (blagajna never negative)", async () => {
    await fundBlagajna(300_000, userId);
    await expect(
      recordCashExpense(
        {
          amount: 500_000,
          category: "FUEL",
          description: "Премногу",
          attachmentUrl: "https://s3.local/x.jpg",
        },
        userId,
      ),
    ).rejects.toThrow();
    expect(await prisma.cashLedgerEntry.count({ where: { direction: "OUT" } })).toBe(0);
  });
});

// ── W5: honorar → auto ACTORS Expense (D2/B16), no double billing (B15), B8 ────
describe("W5 — contractors / honorari", () => {
  it("T13 / B16: a billable allocation on a talent contractor creates exactly one ACTORS Expense", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    const contractor = await createTalentContractor();
    await fundBlagajna(1_000_000, userId);

    const paymentId = await calcHonorar(
      {
        contractorId: contractor.id,
        period: PERIOD,
        grossAmount: 100_000,
        allocations: [{ clientId: client.id, amount: 100_000, billable: true }],
      },
      userId,
    );
    // Withholding 10% → net 90.000.
    const payment = await prisma.contractorPayment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.taxAmount).toBe(10_000);
    expect(payment.netAmount).toBe(90_000);

    await payoutHonorar({ paymentId, channel: "CASH", documentNumber: "DELO-1" }, userId);

    const actors = await prisma.expense.findMany({ where: { category: "ACTORS" } });
    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({
      amount: 100_000, // allocated BRUTO
      isBillable: true,
      clientId: client.id,
      contractorPaymentId: paymentId,
    });
  });

  it("T14 / B15: paying out twice does NOT create a second ACTORS Expense (idempotent)", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    const contractor = await createTalentContractor();
    await fundBlagajna(1_000_000, userId);
    const paymentId = await calcHonorar(
      {
        contractorId: contractor.id,
        period: PERIOD,
        grossAmount: 100_000,
        allocations: [{ clientId: client.id, amount: 100_000, billable: true }],
      },
      userId,
    );
    await payoutHonorar({ paymentId, channel: "CASH", documentNumber: "DELO-1" }, userId);
    await payoutHonorar({ paymentId, channel: "CASH", documentNumber: "DELO-1" }, userId); // repeat

    expect(await prisma.expense.count({ where: { category: "ACTORS" } })).toBe(1);
  });

  it("T12 / B15: W1 bills the ACTORS Expense once, then it is excluded from re-billing", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 3_000_000 });
    await addActorsLineTemplate(client.id);
    const contractor = await createTalentContractor();
    await fundBlagajna(1_000_000, userId);
    const paymentId = await calcHonorar(
      {
        contractorId: contractor.id,
        period: PERIOD,
        grossAmount: 100_000,
        allocations: [{ clientId: client.id, amount: 100_000, billable: true }],
      },
      userId,
    );
    await payoutHonorar({ paymentId, channel: "CASH", documentNumber: "DELO-1" }, userId);

    await generateCharges(PERIOD, userId);
    const actorsLine = await prisma.chargeLine.findFirstOrThrow({ where: { type: "ACTORS" } });
    expect(actorsLine.amount).toBe(100_000);

    const expense = await prisma.expense.findFirstOrThrow({ where: { category: "ACTORS" } });
    expect(expense.billedOnLineId).toBe(actorsLine.id); // marked as billed (B15)

    // No unbilled billable ACTORS expense remains → a second W1 run cannot re-bill it.
    const rebillable = await prisma.expense.findMany({
      where: { clientId: client.id, category: "ACTORS", isBillable: true, billedOnLineId: null },
    });
    expect(rebillable).toHaveLength(0);
  });

  it("B8: NO_WITHHOLDING is rejected unless the contract is CONTRACTOR_INVOICE", async () => {
    const bad = zCreateContractor.safeParse({
      name: "Х",
      contractType: "DOGOVOR_NA_DELO",
      taxMode: "NO_WITHHOLDING",
      isTalent: false,
    });
    expect(bad.success).toBe(false);

    const ok = zCreateContractor.safeParse({
      name: "Х",
      contractType: "CONTRACTOR_INVOICE",
      taxMode: "NO_WITHHOLDING",
      isTalent: false,
    });
    expect(ok.success).toBe(true);
  });
});
