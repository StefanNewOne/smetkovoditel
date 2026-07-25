import { beforeEach, describe, expect, it } from "vitest";
import { getLoanBalances, recordLoanFromLine } from "@/lib/loans";
import { prisma, resetDb } from "./setup/db";

/**
 * SM-100 — owner/private-person loans (financing flow). A позајмица recorded from a bank line is a
 * liability, never revenue/expense: it takes the line out of the resolve queue and feeds the loan
 * balance (Σ received − Σ repaid), without creating any Charge/Expense.
 */
let userId = "";
beforeEach(async () => {
  ({ userId } = await resetDb());
});

/** A raw unprocessed bank line (IN or OUT) — the case the "mark as loan" flow resolves. */
async function line(direction: "IN" | "OUT", amount: number, hash: string) {
  const bank = await prisma.bankAccount.findFirstOrThrow();
  const imp = await prisma.bankStatementImport.create({
    data: {
      bankAccountId: bank.id,
      statementNumber: 700 + amount,
      statementDate: new Date(Date.UTC(2026, 6, 12)),
      source: "MANUAL_UPLOAD",
      fileRef: "local:x.pdf",
      openingBalance: 0,
      totalDebit: direction === "OUT" ? amount : 0,
      totalCredit: direction === "IN" ? amount : 0,
      closingBalance: 0,
      orderCount: 1,
      status: "PARSED",
    },
  });
  return prisma.statementLine.create({
    data: {
      importId: imp.id,
      lineHash: hash,
      date: new Date(Date.UTC(2026, 6, 12)),
      amount,
      direction,
      description: "",
      processed: false,
    },
  });
}

describe("loans (SM-100)", () => {
  it("records an IN line as a received loan and marks the line resolved (no Charge/Expense)", async () => {
    const l = await line("IN", 5_000_000, "loan:in:1");

    await recordLoanFromLine(l.id, "Кекиќ", "RECEIVED", "прва позајмица", userId);

    const loan = await prisma.loanEntry.findFirstOrThrow();
    expect(loan.direction).toBe("IN");
    expect(loan.kind).toBe("RECEIVED");
    expect(loan.amount).toBe(5_000_000);
    expect(loan.lenderName).toBe("Кекиќ");
    const after = await prisma.statementLine.findUniqueOrThrow({ where: { id: l.id } });
    expect(after.processed).toBe(true);
    expect(after.linkedType).toBe("Loan");
    expect(await prisma.charge.count()).toBe(0);
    expect(await prisma.expense.count()).toBe(0); // financing never touches P&L
    const audit = await prisma.auditLog.findFirst({ where: { action: "loan.recorded" } });
    expect(audit).not.toBeNull();
  });

  it("nets примена − поврат − (дадена − наплата) per person", async () => {
    await recordLoanFromLine((await line("IN", 5_000_000, "l:1")).id, "Кекиќ", "RECEIVED", null, userId); // prettier-ignore
    await recordLoanFromLine((await line("IN", 3_000_000, "l:2")).id, "Кекиќ", "RECEIVED", null, userId); // prettier-ignore
    await recordLoanFromLine(
      (await line("OUT", 2_000_000, "l:3")).id,
      "Кекиќ",
      "REPAID",
      null,
      userId,
    );
    await recordLoanFromLine(
      (await line("OUT", 1_000_000, "l:4")).id,
      "Кекиќ",
      "GIVEN",
      null,
      userId,
    );

    const balances = await getLoanBalances();
    expect(balances).toHaveLength(1);
    expect(balances[0]!.lenderName).toBe("Кекиќ");
    // (5M + 3M received − 2M repaid) − (1M given − 0 collected) = 5M owed to the person
    expect(balances[0]!.netRaw).toBe(5_000_000);
    expect(balances[0]!.count).toBe(4);
  });

  it("rejects a kind that does not match the line direction", async () => {
    const l = await line("IN", 1_000_000, "loan:mismatch");
    // GIVEN is an OUT kind — invalid for an IN line
    await expect(recordLoanFromLine(l.id, "Кекиќ", "GIVEN", null, userId)).rejects.toThrow();
  });

  it("rejects recording an already-resolved line", async () => {
    const l = await line("IN", 1_000_000, "loan:dup");
    await recordLoanFromLine(l.id, "Кекиќ", "RECEIVED", null, userId);
    await expect(recordLoanFromLine(l.id, "Кекиќ", "RECEIVED", null, userId)).rejects.toThrow();
  });
});
