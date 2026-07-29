import { beforeEach, describe, expect, it } from "vitest";
import { formatMKD } from "@smetko/shared";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { getDashboard } from "@/lib/dashboard";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient, fundBlagajna } from "./setup/factories";

/**
 * SM-103 — the Dashboard aggregator reads live totals from data other workflows produce. Seeds a
 * bank statement, an approved+part-paid invoice, an unapproved draft, cash movements, and an
 * unresolved statement line, then asserts each KPI / panel / attention counter.
 */
const PERIOD = "2026-07";
const d0 = (n: number) => formatMKD(n, { decimals: 0 });
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("dashboard aggregator (SM-103)", () => {
  it("computes KPIs, channel progress, top debtors, and attention counts", async () => {
    // Two invoice clients → W1 drafts. Approve A (becomes owed), leave B as a DRAFT.
    const a = await createInvoiceClient({ userId, monthlyAmount: 3_000_000, name: "Клиент А" });
    await createInvoiceClient({ userId, monthlyAmount: 1_000_000, name: "Клиент Б" });
    await generateCharges(PERIOD, userId); // → 2 DRAFT charges

    const chargeA = await prisma.charge.findFirstOrThrow({ where: { clientId: a.id } });
    await approveInvoice(chargeA.id, userId); // DRAFT → OPEN, total = 3.000.000 + 18% = 3.540.000

    // Partial payment on A this month: paid 1.000.000, remaining 2.540.000.
    await prisma.payment.create({
      data: {
        clientId: a.id,
        chargeId: chargeA.id,
        channel: "BANK",
        amount: 1_000_000,
        date: new Date(Date.UTC(2026, 6, 15)),
        matchStatus: "MANUAL_MATCHED",
      },
    });
    await prisma.charge.update({
      where: { id: chargeA.id },
      data: { paidAmount: 1_000_000, status: "PARTIALLY_PAID" },
    });

    // Bank statement (latest PARSED) + an unresolved outgoing line (Решавање queue).
    const bank = await prisma.bankAccount.findFirstOrThrow();
    const imp = await prisma.bankStatementImport.create({
      data: {
        bankAccountId: bank.id,
        statementNumber: 200,
        statementDate: new Date(Date.UTC(2026, 6, 20)),
        source: "MANUAL_UPLOAD",
        fileRef: "t",
        openingBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        closingBalance: 5_000_000,
        orderCount: 1,
        status: "PARSED",
      },
    });
    await prisma.statementLine.create({
      data: {
        importId: imp.id,
        lineHash: "dash-out-1",
        date: new Date(Date.UTC(2026, 6, 20)),
        amount: 12_300,
        direction: "OUT",
        description: "SKOPJE SOMETHING",
        classifiedAs: "CARD_TX",
        processed: false,
      },
    });

    // Cash: +2.000.000 opening, −500.000 → balance 1.500.000.
    await fundBlagajna(2_000_000, userId, PERIOD);
    await prisma.cashLedgerEntry.create({
      data: {
        direction: "OUT",
        amount: 500_000,
        date: new Date(Date.UTC(2026, 6, 18)),
        description: "Кеш трошок",
        counterpartyType: "VENDOR",
        documentType: "KASA_ISPLATI",
        documentNumber: "T-1",
        periodId: PERIOD,
        createdById: userId,
      },
    });

    const d = await getDashboard();
    const kpi = (label: string) => d.kpis.find((k) => k.label === label)!.value;

    // ── KPIs ──
    expect(kpi("Салдо банка")).toBe(d0(5_000_000));
    expect(kpi("Салдо благајна")).toBe(d0(1_500_000));
    expect(kpi("Задолжено")).toBe(d0(2_540_000)); // only A is OPEN; B still a draft
    expect(kpi("Наплатено")).toBe(d0(1_000_000));

    // ── Channel progress (over open charges) ──
    expect(d.invoices.billed).toBe(3_540_000);
    expect(d.invoices.paid).toBe(1_000_000);
    expect(d.invoices.pct).toBeCloseTo(1_000_000 / 3_540_000, 4);
    expect(d.cash.billed).toBe(0); // no open cash obligations

    // ── Top debtors ──
    expect(d.topDebtors).toHaveLength(1);
    expect(d.topDebtors[0]!.clientId).toBe(a.id);
    expect(d.topDebtors[0]!.name).toBe("Клиент А");
    expect(d.topDebtors[0]!.initials).toBe("КА");
    expect(d.topDebtors[0]!.amount).toBe(d0(2_540_000));

    // ── Attention counters ──
    const at = (key: string) => d.attention.find((x) => x.key === key)!.count;
    expect(at("resolve")).toBe(1); // the unprocessed CARD_TX line
    expect(at("drafts")).toBe(1); // client Б's unapproved draft
    expect(at("facebk")).toBe(0);
    expect(at("partial")).toBe(0);
  });

  it("returns safe empty values on a fresh DB", async () => {
    const d = await getDashboard();
    expect(d.kpis.find((k) => k.label === "Салдо банка")!.value).toBe("—");
    expect(d.kpis.find((k) => k.label === "Задолжено")!.value).toBe(d0(0));
    expect(d.topDebtors).toHaveLength(0);
    expect(d.attention.every((a) => a.count === 0)).toBe(true);
  });
});
