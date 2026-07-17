import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { PeriodClosedError } from "@/lib/period-guard";
import { ignoreStatementLine, ingestStatement, manualMatchStatementLine } from "@/lib/workflows/w2";
import { approveInvoice, generateCharges } from "@/lib/workflows/w1";
import { prisma, resetDb } from "./setup/db";
import { createInvoiceClient } from "./setup/factories";

/**
 * Import-center manual resolution (§9.4, audit fix #1). A CLIENT_PAYMENT line that did not
 * auto-match (wrong/absent повик) can be matched to a chosen charge; a noise line can be ignored.
 * Both are period-guarded (B9) and audited.
 */
const FX = "../../../packages/shared/src/parsers/__fixtures__";
const fixture = (f: string) =>
  readFileSync(fileURLToPath(new URL(`${FX}/${f}`, import.meta.url)), "utf8");

const PERIOD = "2026-07";
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

/** Import statement 146; its CLIENT_PAYMENT line (ref 1-70/2026) matches no charge → unprocessed. */
async function unmatchedPaymentLine() {
  await ingestStatement(fixture("nlb-146.txt"), "u:146", "MANUAL_UPLOAD", userId);
  return prisma.statementLine.findFirstOrThrow({ where: { classifiedAs: "CLIENT_PAYMENT" } });
}

describe("manual match (fix #1)", () => {
  it("applies an unresolved payment line to a chosen open charge", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);
    const line = await unmatchedPaymentLine();
    expect(line.processed).toBe(false);

    await manualMatchStatementLine(line.id, charge.id, userId);

    const after = await prisma.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(after.paidAmount).toBe(2_000_000); // the 20.000,00 line
    expect(after.status).toBe("PARTIALLY_PAID"); // < total (2.360.000 with VAT)
    const payment = await prisma.payment.findFirstOrThrow();
    expect(payment.matchStatus).toBe("MANUAL_MATCHED");
    const resolved = await prisma.statementLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(resolved.processed).toBe(true);
  });

  it("refuses to match into a CLOSED period (B9)", async () => {
    const client = await createInvoiceClient({ userId, monthlyAmount: 2_000_000 });
    await generateCharges(PERIOD, userId);
    const charge = await prisma.charge.findFirstOrThrow({ where: { clientId: client.id } });
    await approveInvoice(charge.id, userId);
    const line = await unmatchedPaymentLine();
    await prisma.period.update({ where: { id: PERIOD }, data: { status: "CLOSED" } });

    await expect(manualMatchStatementLine(line.id, charge.id, userId)).rejects.toBeInstanceOf(
      PeriodClosedError,
    );
  });
});

describe("ignore line (fix #1)", () => {
  it("marks a noise line resolved without booking", async () => {
    // 149's two CARD_TX lines have no vendor rule seeded → they stay unprocessed.
    await ingestStatement(fixture("nlb-149.txt"), "u:149", "MANUAL_UPLOAD", userId);
    const card = await prisma.statementLine.findFirstOrThrow({
      where: { classifiedAs: "CARD_TX" },
    });

    await ignoreStatementLine(card.id, userId);

    const after = await prisma.statementLine.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.processed).toBe(true);
    expect(after.linkedType).toBe("Ignored");
    expect(await prisma.expense.count()).toBe(0); // nothing booked
    const audit = await prisma.auditLog.findFirst({ where: { action: "line.ignored" } });
    expect(audit).not.toBeNull();
  });
});
