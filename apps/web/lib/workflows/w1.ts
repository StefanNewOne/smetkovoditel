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
export async function generateCharges(period: string, userId: string) {
  await assertPeriodOpen(prisma, period); // B9
  const start = periodStart(period);
  const clients = await prisma.client.findMany({
    where: { status: ClientStatus.ACTIVE },
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
          status: isInvoice ? ChargeStatus.DRAFT : ChargeStatus.OPEN,
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

      // creditBalance auto-apply for cash obligations immediately (B18). For invoices this
      // happens at approval. Modeled as an internal paidAmount adjustment (audited), not a
      // cash Payment, since credit is not a money movement.
      if (!isInvoice && client.creditBalance > 0 && total > 0) {
        const applied = Math.min(client.creditBalance, total);
        await tx.charge.update({
          where: { id: charge.id },
          data: {
            paidAmount: applied,
            status: applied >= total ? ChargeStatus.PAID : ChargeStatus.PARTIALLY_PAID,
          },
        });
        await tx.client.update({
          where: { id: client.id },
          data: { creditBalance: { decrement: applied } },
        });
      }

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

/** SM-89 — delete an unneeded DRAFT charge. Safe: a draft has no assigned number (B1: the counter
 *  is not consumed until issuance) and no payments. Only DRAFT; period-guarded (B9); audited. */
export async function deleteDraftCharge(chargeId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new Error("Задолжувањето не постои.");
    if (charge.status !== ChargeStatus.DRAFT)
      throw new Error("Само ДРАФТ задолжување може да се избрише.");
    await assertPeriodOpen(tx, charge.period); // B9
    await tx.chargeLine.deleteMany({ where: { chargeId } });
    await writeAudit(tx, {
      entity: "Charge",
      entityId: chargeId,
      action: "delete.draft",
      diff: { clientId: charge.clientId, period: charge.period, total: charge.total },
      userId,
    });
    await tx.charge.delete({ where: { id: chargeId } });
  });
}
