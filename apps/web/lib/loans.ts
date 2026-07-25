import "server-only";
import { formatMKD } from "@smetko/shared";
import { Direction, type LoanKind, prisma } from "@smetko/db";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";

/**
 * SM-100/SM-102 — owner/private-person loans (financing flow). A loan is a liability/receivable,
 * never revenue or expense. Four kinds:
 *   RECEIVED (примена, IN)   — a person lent to the company        → company owes them (+liability)
 *   REPAID   (поврат, OUT)   — the company paid a person back      → −liability
 *   GIVEN    (дадена, OUT)   — the company lent to a person        → person owes company (+receivable)
 *   COLLECTED(наплата, IN)   — a person paid the company back      → −receivable
 * Recording one from a bank line takes it out of the Решавање queues and feeds the loan balance,
 * without ever creating a Charge/Expense.
 */

/** Which kinds are valid for a given bank direction (IN = money into the company, OUT = out). */
export const LOAN_KINDS_BY_DIRECTION: Record<"IN" | "OUT", { kind: LoanKind; label: string }[]> = {
  IN: [
    { kind: "RECEIVED", label: "Примена (примивме позајмица)" },
    { kind: "COLLECTED", label: "Наплата (ни враќаат дадена)" },
  ],
  OUT: [
    { kind: "GIVEN", label: "Дадена (дадовме позајмица)" },
    { kind: "REPAID", label: "Поврат (враќаме примена)" },
  ],
};

/** Period id ("YYYY-MM") for a transaction date — the economic month the loan movement belongs to. */
function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Record an unresolved bank line as a loan movement of the chosen kind. The kind must match the
 * line's bank direction (RECEIVED/COLLECTED ← IN, GIVEN/REPAID ← OUT). Marks the line processed
 * (linkedType "Loan"). Atomic, audited, period-guarded (B9). Rejects an already-processed line.
 */
export async function recordLoanFromLine(
  lineId: string,
  lenderName: string,
  kind: LoanKind,
  note: string | null,
  userId: string,
): Promise<{ id: string }> {
  const name = lenderName.trim();
  if (name.length < 2) throw new Error("Внеси го името на лицето.");

  return prisma.$transaction(async (tx) => {
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line) throw new Error("Линијата не постои.");
    if (line.processed) throw new Error("Линијата е веќе решена.");
    const valid = LOAN_KINDS_BY_DIRECTION[line.direction === Direction.IN ? "IN" : "OUT"];
    if (!valid.some((v) => v.kind === kind)) throw new Error("Типот не одговара на насоката.");

    const periodId = periodOf(line.date);
    await tx.period.upsert({ where: { id: periodId }, update: {}, create: { id: periodId } });
    await assertPeriodOpen(tx, periodId); // B9

    const loan = await tx.loanEntry.create({
      data: {
        lenderName: name,
        direction: line.direction,
        kind,
        amount: line.amount,
        date: line.date,
        note: note?.trim() || null,
        statementLineId: line.id,
        periodId,
        createdById: userId,
      },
    });
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, linkedType: "Loan", linkedId: loan.id },
    });
    await writeAudit(tx, {
      entity: "LoanEntry",
      entityId: loan.id,
      action: "loan.recorded",
      diff: { lenderName: name, kind, amount: line.amount },
      userId,
    });
    return { id: loan.id };
  });
}

/** Undo a loan entry — deletes it and returns its bank line to the Решавање queue (to reclassify). */
export async function deleteLoanEntry(id: string, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const loan = await tx.loanEntry.findUnique({ where: { id } });
    if (!loan) throw new Error("Записот не постои.");
    if (loan.statementLineId) {
      await tx.statementLine.update({
        where: { id: loan.statementLineId },
        data: { processed: false, linkedType: null, linkedId: null },
      });
    }
    await writeAudit(tx, {
      entity: "LoanEntry",
      entityId: id,
      action: "loan.deleted",
      diff: { lenderName: loan.lenderName, kind: loan.kind, amount: loan.amount },
      userId,
    });
    await tx.loanEntry.delete({ where: { id } });
  });
}

export interface LoanTxn {
  id: string;
  kind: LoanKind;
  kindLabel: string;
  amount: string;
  date: string;
  statementNumber: number | null;
  note: string | null;
}
export interface LoanBalanceRow {
  lenderName: string;
  count: number;
  received: string; // Σ RECEIVED
  repaid: string; // Σ REPAID
  given: string; // Σ GIVEN
  collected: string; // Σ COLLECTED
  net: string; // (received−repaid) − (given−collected); >0 company owes, <0 person owes
  netRaw: number;
  txns: LoanTxn[];
}

const KIND_LABEL: Record<LoanKind, string> = {
  RECEIVED: "Примена",
  REPAID: "Поврат",
  GIVEN: "Дадена",
  COLLECTED: "Наплата",
};
const dt = (d: Date) =>
  new Date(d).toLocaleDateString("mk-MK", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Per-person loan balances with their transactions (drill-down). Net >0 = company owes the person. */
export async function getLoanBalances(): Promise<LoanBalanceRow[]> {
  const all = await prisma.loanEntry.findMany({
    include: { statementLine: { select: { import: { select: { statementNumber: true } } } } },
    orderBy: [{ lenderName: "asc" }, { date: "asc" }],
  });
  const byLender = new Map<string, typeof all>();
  for (const l of all) {
    const list = byLender.get(l.lenderName) ?? [];
    list.push(l);
    byLender.set(l.lenderName, list);
  }
  const sum = (list: typeof all, k: LoanKind) =>
    list.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0);

  return [...byLender.entries()]
    .map(([lenderName, list]) => {
      const received = sum(list, "RECEIVED");
      const repaid = sum(list, "REPAID");
      const given = sum(list, "GIVEN");
      const collected = sum(list, "COLLECTED");
      const netRaw = received - repaid - (given - collected);
      return {
        lenderName,
        count: list.length,
        received: formatMKD(received, { decimals: 0 }),
        repaid: formatMKD(repaid, { decimals: 0 }),
        given: formatMKD(given, { decimals: 0 }),
        collected: formatMKD(collected, { decimals: 0 }),
        net: formatMKD(netRaw, { decimals: 0 }),
        netRaw,
        txns: list.map((l) => ({
          id: l.id,
          kind: l.kind,
          kindLabel: KIND_LABEL[l.kind],
          amount: formatMKD(l.amount, { decimals: 0 }),
          date: dt(l.date),
          statementNumber: l.statementLine?.import.statementNumber ?? null,
          note: l.note,
        })),
      };
    })
    .sort((a, b) => Math.abs(b.netRaw) - Math.abs(a.netRaw));
}
