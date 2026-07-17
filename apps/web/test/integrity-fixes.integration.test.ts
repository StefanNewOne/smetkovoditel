import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { ingestReceipt, ingestStatement, runMatching } from "@/lib/workflows/w2";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { calcHonorar } from "@/lib/workflows/w5";
import { markOverdue } from "@/lib/workflows/w4";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * Integrity fixes found in the system audit (2026-07-17):
 *  #2 ±6% USD rate sanity in matching (§4.4)
 *  #3 statement continuity gate — opening == prior closing (B14)
 *  #4 period guards: W2 match + W4 markOverdue never touch a CLOSED period (B9)
 *  #5 billable allocation on a non-talent contractor is rejected (D2)
 */
const FX = "../../../packages/shared/src/parsers/__fixtures__";
const fixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`${FX}/${f}`, import.meta.url)), "utf8");

const PERIOD = "2026-07";
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

describe("#3 statement continuity (B14)", () => {
  const nlb149 = () => fixture("nlb-149.txt");
  const make150 = (header: string) =>
    nlb149().replace("30.000,0012.000,000,0018.000,0071", header).replace("izvod149", "izvod150");

  it("accepts a continuous next statement (opening == prior closing)", async () => {
    await ingestStatement(nlb149(), "u:149", "MANUAL_UPLOAD", userId); // closing 18.000
    const cont = make150("18.000,0012.000,000,006.000,0071"); // opening 18.000 ✓
    const res = await ingestStatement(cont, "u:150", "MANUAL_UPLOAD", userId);
    expect(res.status).toBe("PARSED");
  });

  it("FAILS a discontinuous statement and posts nothing", async () => {
    await ingestStatement(nlb149(), "u:149", "MANUAL_UPLOAD", userId); // closing 18.000
    const bad = make150("99.000,0012.000,000,0087.000,0071"); // opening 99.000 ✗
    const res = await ingestStatement(bad, "u:150", "MANUAL_UPLOAD", userId);
    expect(res.status).toBe("FAILED");
    if (res.status === "FAILED") expect(res.messages[0]).toMatch(/Континуитет/);
    const imp = await prisma.bankStatementImport.findFirstOrThrow({
      where: { statementNumber: 150 },
    });
    expect(imp.status).toBe("FAILED");
    // 149 posted 7 lines; the failed 150 posts none.
    expect(await prisma.statementLine.count()).toBe(7);
  });
});

describe("#4 period guards (B9)", () => {
  it("W2 does NOT apply a payment to an invoice in a CLOSED period", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    const { invoiceNumber } = await approveInvoice(charge.id, userId); // "1-1/7-2026"
    await prisma.period.update({ where: { id: PERIOD }, data: { status: "CLOSED" } });

    // Statement 146 carries a CLIENT_PAYMENT line; point its reference at our invoice.
    const stmt = fixture("nlb-146.txt").replace("1-70/2026", invoiceNumber.replace("/7-", "/"));
    const res = await ingestStatement(stmt, "u:146", "MANUAL_UPLOAD", userId);
    expect(res.status).toBe("PARSED");

    const after = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(after.paidAmount).toBe(0); // unchanged — posted history untouched
    expect(await prisma.payment.count()).toBe(0);
    const line = await prisma.statementLine.findFirstOrThrow({
      where: { classifiedAs: "CLIENT_PAYMENT" },
    });
    expect(line.processed).toBe(false); // left for manual handling
  });

  it("W4 markOverdue skips charges in a CLOSED period", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);
    await prisma.charge.update({
      where: { id: charge.id },
      data: { dueDate: new Date(Date.now() - 40 * 86_400_000) }, // long overdue
    });

    // Open period → gets marked OVERDUE.
    expect(await markOverdue(new Date(), userId)).toBe(1);
    await prisma.charge.update({ where: { id: charge.id }, data: { status: "OPEN" } }); // reset

    // Closed period → excluded.
    await prisma.period.update({ where: { id: PERIOD }, data: { status: "CLOSED" } });
    expect(await markOverdue(new Date(), userId)).toBe(0);
    const still = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(still.status).toBe("OPEN");
  });
});

describe("#5 non-talent billable allocation (D2)", () => {
  it("rejects a billable allocation on a non-talent contractor", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    const contractor = await prisma.contractor.create({
      data: {
        name: "Не-актер",
        contractType: "DOGOVOR_NA_DELO",
        taxMode: "WITHHOLD_10",
        isTalent: false,
      },
    });
    await expect(
      calcHonorar(
        {
          contractorId: contractor.id,
          period: PERIOD,
          grossAmount: 100_000,
          allocations: [{ clientId: client.id, amount: 100_000, billable: true }],
        },
        userId,
      ),
    ).rejects.toThrow(/актери|isTalent|D2/);
  });

  it("allows a non-billable allocation on a non-talent contractor", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 1_000_000 });
    const contractor = await prisma.contractor.create({
      data: {
        name: "Копирајтер",
        contractType: "DOGOVOR_NA_DELO",
        taxMode: "WITHHOLD_10",
        isTalent: false,
      },
    });
    const id = await calcHonorar(
      {
        contractorId: contractor.id,
        period: PERIOD,
        grossAmount: 100_000,
        allocations: [{ clientId: client.id, amount: 100_000, billable: false }],
      },
      userId,
    );
    expect(id).toBeTruthy();
  });
});

describe("#2 ±6% USD rate sanity (§4.4)", () => {
  async function matchWithRate(midMkd: number) {
    await prisma.adAccount.create({
      data: { metaAccountId: "500000000000001", name: "Acc", clientId: null },
    });
    // statement 149 dated 12.03.2026; line AAAA111111 = 1.000,00 ден (100000); meta-1 = $18 (1800c).
    await prisma.exchangeRate.create({
      data: { date: new Date(Date.UTC(2026, 2, 1)), code: "USD", midMkd },
    });
    await ingestStatement(fixture("nlb-149.txt"), "u:149", "MANUAL_UPLOAD", userId);
    await ingestReceipt(fixture("meta-1.txt"), "s3://m1", userId);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "match.auto" } });
    const expense = await prisma.expense.findFirstOrThrow({ where: { category: "ADS" } });
    return { rateSanityOk: (audit.diff as { rateSanityOk?: boolean }).rateSanityOk, expense };
  }

  it("flags rateSanityOk = true when the implied rate is within ±6% (implied ≈ 55.6)", async () => {
    const { rateSanityOk, expense } = await matchWithRate(55.5);
    expect(rateSanityOk).toBe(true);
    expect(expense.amount).toBe(100_000); // booked MKD, 1:1
  });

  it("flags rateSanityOk = false when out of band, but still books the correct MKD", async () => {
    const { rateSanityOk, expense } = await matchWithRate(40);
    expect(rateSanityOk).toBe(false);
    expect(expense.amount).toBe(100_000); // amount is ALWAYS the statement MKD (D3)
  });
});
