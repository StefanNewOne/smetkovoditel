import "server-only";
import {
  ChargeKind,
  ChargeStatus,
  ClientStatus,
  ExpenseCategory,
  LineType,
  Prisma,
  prisma,
} from "@smetko/db";
import {
  addDays,
  internalRef,
  invoiceNumber,
  NEW_NUMBERING_FROM,
  periodStart,
  VAT_RATE,
} from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";

interface DraftLine {
  type: LineType;
  description: string;
  amount: number; // дени
  vatRate: number;
  sourceExpenseIds?: string[];
}

/**
 * W1 — monthly charges (Master Plan §W1). For every ACTIVE client, create exactly one Charge
 * for the period (B12: enforced by @@unique[clientId, period, kind]):
 *  - SERVICE line from the active package version
 *  - META_ADS / ACTORS lines = Σ of unbilled billable Expenses (D2, B15) — empty until Ф2
 *  - OTHER (FIXED templates)
 * INVOICE → DRAFT (+18% ДДВ, number assigned at approval); CASH_OBLIGATION → OPEN (no number/VAT).
 * Idempotent: an existing charge for (client, period, kind) is skipped (safe to re-run).
 */
export async function generateCharges(
  period: string,
  userId: string,
  channel?: "INVOICE" | "CASH",
) {
  await assertPeriodOpen(prisma, period); // B9
  const start = periodStart(period);
  const clients = await prisma.client.findMany({
    where: { status: ClientStatus.ACTIVE, ...(channel ? { paymentChannel: channel } : {}) },
    include: { packages: true, lineTemplates: { where: { active: true } } },
  });

  let created = 0;
  let skipped = 0;

  for (const client of clients) {
    const kind =
      client.paymentChannel === "INVOICE" ? ChargeKind.INVOICE : ChargeKind.CASH_OBLIGATION;

    const existing = await prisma.charge.findUnique({
      where: { clientId_period_kind: { clientId: client.id, period, kind } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const pkg = client.packages.find(
      (p) => p.effectiveFrom <= start && (p.effectiveTo === null || p.effectiveTo > start),
    );
    if (!pkg) {
      skipped++; // no active package this period → nothing to charge
      continue;
    }

    // SM-88 — respect the client's start date and the package billing cycle.
    const anchor = client.startDate ?? pkg.effectiveFrom;
    const anchorMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
    if (start < anchorMonth) {
      skipped++; // client has not started yet in this period
      continue;
    }
    if (pkg.billingCycle === "QUARTERLY") {
      const monthsSinceStart =
        (start.getUTCFullYear() - anchorMonth.getUTCFullYear()) * 12 +
        (start.getUTCMonth() - anchorMonth.getUTCMonth());
      if (monthsSinceStart % 3 !== 0) {
        skipped++; // quarterly client — bill only on the cycle boundary (every 3rd month)
        continue;
      }
    }

    const isInvoice = kind === ChargeKind.INVOICE;
    const vatRate = isInvoice ? VAT_RATE : 0;

    await prisma.$transaction(async (tx) => {
      const lines: DraftLine[] = [
        {
          type: LineType.SERVICE,
          description:
            pkg.description ??
            (pkg.billingCycle === "QUARTERLY" ? "Тромесечен пакет" : "Месечен пакет"),
          amount: pkg.monthlyAmount,
          vatRate,
        },
      ];

      for (const tpl of client.lineTemplates) {
        if (tpl.type === LineType.META_ADS || tpl.type === LineType.ACTORS) {
          const category =
            tpl.type === LineType.META_ADS ? ExpenseCategory.ADS : ExpenseCategory.ACTORS;
          const expenses = await tx.expense.findMany({
            where: { clientId: client.id, isBillable: true, billedOnLineId: null, category },
          });
          const sum = expenses.reduce((s, e) => s + e.amount, 0);
          if (sum > 0) {
            lines.push({
              type: tpl.type,
              description: tpl.type === LineType.META_ADS ? "Meta Ads (префактурирање)" : "Актери",
              amount: sum,
              vatRate,
              sourceExpenseIds: expenses.map((e) => e.id),
            });
          }
        } else if (tpl.type === LineType.OTHER && tpl.fixedAmount && tpl.fixedAmount > 0) {
          lines.push({
            type: LineType.OTHER,
            description: "Дополнителна ставка",
            amount: tpl.fixedAmount,
            vatRate,
          });
        }
      }

      const subtotal = lines.reduce((s, l) => s + l.amount, 0);
      const vatAmount = isInvoice
        ? lines.reduce((s, l) => s + Math.round(l.amount * l.vatRate), 0)
        : 0;
      const total = subtotal + vatAmount;
      const issueDate = start;
      const dueDate = addDays(issueDate, client.paymentTermDays);

      const charge = await tx.charge.create({
        data: {
          clientId: client.id,
          kind,
          period,
          issueDate,
          dueDate,
          status: ChargeStatus.DRAFT, // SM-89: both invoice and cash start as DRAFT (reviewable)
          subtotal,
          vatAmount,
          total,
          lines: {
            create: lines.map((l) => ({
              type: l.type,
              description: l.description,
              amount: l.amount,
              vatRate: l.vatRate,
              sourceRefs: l.sourceExpenseIds
                ? (l.sourceExpenseIds.map((id) => ({ expenseId: id })) as Prisma.InputJsonValue)
                : undefined,
            })),
          },
        },
        include: { lines: true },
      });

      // Mark billed expenses so they are never billed twice (B15). T12.
      for (const line of charge.lines) {
        const refs = (line.sourceRefs as { expenseId: string }[] | null) ?? [];
        if (refs.length > 0) {
          await tx.expense.updateMany({
            where: { id: { in: refs.map((r) => r.expenseId) } },
            data: { billedOnLineId: line.id },
          });
        }
      }

      // creditBalance auto-apply (B18) now happens at approval for both kinds (SM-89) — the charge
      // is a DRAFT here, so nothing is applied yet.

      await writeAudit(tx, {
        entity: "Charge",
        entityId: charge.id,
        action: "w1.create",
        diff: { clientId: client.id, period, kind, total },
        userId,
      });
    });

    created++;
  }

  return { created, skipped };
}

/**
 * Approve a DRAFT invoice → OPEN, assigning the next global monthly number `1-{n}/{M}-{YYYY}`
 * atomically (B1: no gaps, at issuance), retrying on the seqInMonth unique race. Applies any
 * creditBalance (B18). Idempotent for an already-approved charge. Throws on error.
 */
export async function approveInvoice(
  chargeId: string,
  userId: string,
): Promise<{ invoiceNumber: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const charge = await tx.charge.findUnique({ where: { id: chargeId } });
        if (!charge) throw new Error("Задолжувањето не постои.");
        if (charge.kind !== ChargeKind.INVOICE) throw new Error("Само фактури добиваат број.");
        if (charge.status !== ChargeStatus.DRAFT) {
          return { invoiceNumber: charge.invoiceNumber ?? "" };
        }
        await assertPeriodOpen(tx, charge.period); // B9

        const client = await tx.client.findUnique({ where: { id: charge.clientId } });
        if (!client) throw new Error("Клиентот не постои.");

        // Fixed client number (SM-85) — assign the next one if this client has none yet.
        let clientNo = client.number;
        if (clientNo == null) {
          const maxNo = await tx.client.aggregate({ _max: { number: true } });
          clientNo = (maxNo._max.number ?? 0) + 1;
          await tx.client.update({ where: { id: client.id }, data: { number: clientNo } });
        }
        const intRef = internalRef(clientNo, charge.period);

        // Legal number (SM-87): the running fiscal counter until 2026-08, then the internal scheme
        // `1-{clientNo}/{M}-{YYYY}`. Both are always stored; from August the legal number == intRef.
        let seq: number | null = null;
        let number: string;
        if (charge.period >= NEW_NUMBERING_FROM) {
          number = intRef;
        } else {
          const agg = await tx.charge.aggregate({
            where: { period: charge.period, seqInMonth: { not: null } },
            _max: { seqInMonth: true },
          });
          seq = (agg._max.seqInMonth ?? 0) + 1;
          number = invoiceNumber(seq, charge.period);
        }

        let paidAmount = charge.paidAmount;
        if (client.creditBalance > 0 && charge.total > paidAmount) {
          const applied = Math.min(client.creditBalance, charge.total - paidAmount);
          paidAmount += applied;
          await tx.client.update({
            where: { id: client.id },
            data: { creditBalance: { decrement: applied } },
          });
        }
        const status =
          paidAmount >= charge.total
            ? ChargeStatus.PAID
            : paidAmount > 0
              ? ChargeStatus.PARTIALLY_PAID
              : ChargeStatus.OPEN;

        await tx.charge.update({
          where: { id: chargeId },
          data: {
            seqInMonth: seq,
            invoiceNumber: number,
            internalRef: intRef,
            issueDate: new Date(), // датум на издавање = денот на одобрување (DRAFT→OPEN)
            status,
            paidAmount,
          },
        });
        await writeAudit(tx, {
          entity: "Charge",
          entityId: chargeId,
          action: "approve",
          diff: { invoiceNumber: number, internalRef: intRef, seqInMonth: seq },
          userId,
        });
        return { invoiceNumber: number };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Нумерацијата не успеа по повеќе обиди.");
}

/** SM-89 — approve a CASH_OBLIGATION draft (DRAFT → OPEN). No number, no VAT; applies creditBalance
 *  (B18) and stamps the issue date at approval. Period-guarded (B9), audited. */
export async function approveCashObligation(chargeId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new Error("Задолжувањето не постои.");
    if (charge.kind !== ChargeKind.CASH_OBLIGATION)
      throw new Error("Само кеш-обврска се одобрува вака.");
    if (charge.status !== ChargeStatus.DRAFT) return;
    await assertPeriodOpen(tx, charge.period); // B9

    let paidAmount = charge.paidAmount;
    const client = await tx.client.findUnique({ where: { id: charge.clientId } });
    if (client && client.creditBalance > 0 && charge.total > paidAmount) {
      const applied = Math.min(client.creditBalance, charge.total - paidAmount);
      paidAmount += applied;
      await tx.client.update({
        where: { id: client.id },
        data: { creditBalance: { decrement: applied } },
      });
    }
    const status =
      paidAmount >= charge.total
        ? ChargeStatus.PAID
        : paidAmount > 0
          ? ChargeStatus.PARTIALLY_PAID
          : ChargeStatus.OPEN;

    await tx.charge.update({
      where: { id: chargeId },
      data: { status, paidAmount, issueDate: new Date() },
    });
    await writeAudit(tx, {
      entity: "Charge",
      entityId: chargeId,
      action: "approve.cash",
      diff: { status, paidAmount },
      userId,
    });
  });
}

/** SM-89 — delete a charge (DRAFT, an OPEN cash obligation, or an invoice approved by mistake).
 *  Frees any bank statement lines its payments occupied (re-matchable), unbinds billed expenses and
 *  credit-note links, then removes the charge. Period-guarded (B9 — closed period rejected), audited.
 *  Note: deleting an issued invoice leaves a gap in the fiscal counter (owner-accepted; the UI
 *  double-confirms). Cash ledger entries from cash receipts are left intact (the cash was received). */
export async function deleteCharge(chargeId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new Error("Задолжувањето не постои.");
    await assertPeriodOpen(tx, charge.period); // B9

    const payments = await tx.payment.findMany({
      where: { chargeId },
      select: { id: true, statementLineId: true },
    });
    const slIds = payments.map((p) => p.statementLineId).filter((x): x is string => !!x);
    if (slIds.length)
      await tx.statementLine.updateMany({
        where: { id: { in: slIds } },
        data: { processed: false, linkedType: null, linkedId: null },
      });

    const lines = await tx.chargeLine.findMany({ where: { chargeId }, select: { id: true } });
    const lineIds = lines.map((l) => l.id);
    if (lineIds.length)
      await tx.expense.updateMany({
        where: { billedOnLineId: { in: lineIds } },
        data: { billedOnLineId: null },
      });
    await tx.charge.updateMany({
      where: { relatedChargeId: chargeId },
      data: { relatedChargeId: null },
    });

    await tx.payment.deleteMany({ where: { chargeId } });
    await tx.chargeLine.deleteMany({ where: { chargeId } });
    await writeAudit(tx, {
      entity: "Charge",
      entityId: chargeId,
      action: "delete",
      diff: {
        kind: charge.kind,
        status: charge.status,
        invoiceNumber: charge.invoiceNumber,
        total: charge.total,
      },
      userId,
    });
    await tx.charge.delete({ where: { id: chargeId } });
  });
}
