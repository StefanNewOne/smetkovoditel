import "server-only";
import {
  ChargeStatus,
  Direction,
  ExpenseCategory,
  type ImportSource,
  MatchStatus,
  PayChannel,
  prisma,
} from "@smetko/db";
import pino from "pino";
import { normalizeInvoiceRef, parseMetaReceipt, parseNlbStatement } from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { assertPeriodOpen } from "@/lib/period-guard";

const log = pino({ level: process.env.LOG_LEVEL ?? "info" });

/** USD/MKD rate sanity band for Meta matching (§4.4). Booking always uses the statement MKD. */
const RATE_SANITY_BAND = 0.06;

const OPEN_STATUSES: ChargeStatus[] = [
  ChargeStatus.OPEN,
  ChargeStatus.PARTIALLY_PAID,
  ChargeStatus.OVERDUE,
];

/** Parse a DD.MM.YYYY statement date to a Date (UTC). Falls back to now. */
function parseMkDate(s: string | null): Date {
  const m = s?.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return new Date();
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

export type StatementIngest =
  | {
      status: "PARSED";
      statementNumber: number;
      lines: number;
      clientMatched: number;
      receiptsMatched: number;
    }
  | { status: "DUPLICATE_SKIPPED"; statementNumber: number }
  | { status: "FAILED"; statementNumber: number | null; messages: string[] };

/**
 * W2 — ingest an NLB statement (Master Plan §4.2): dedupe (B13) → integrity gate (B14) →
 * persist lines + classify → auto-book CLIENT_PAYMENT to charges; META_ADS lines await matching.
 */
export async function ingestStatement(
  text: string,
  fileRef: string,
  source: ImportSource,
  userId: string,
): Promise<StatementIngest> {
  const parsed = parseNlbStatement(text);
  if (parsed.statementNumber == null) {
    return {
      status: "FAILED",
      statementNumber: null,
      messages: ["Не може да се прочита бројот на изводот."],
    };
  }
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { accountNumber: parsed.account! },
  });
  if (!bankAccount) {
    return {
      status: "FAILED",
      statementNumber: parsed.statementNumber,
      messages: ["Банкарската сметка не е конфигурирана."],
    };
  }

  // B13 — whole-statement dedupe.
  const dup = await prisma.bankStatementImport.findUnique({
    where: {
      bankAccountId_statementNumber: {
        bankAccountId: bankAccount.id,
        statementNumber: parsed.statementNumber,
      },
    },
  });
  if (dup) return { status: "DUPLICATE_SKIPPED", statementNumber: parsed.statementNumber };

  const statementDate = parseMkDate(parsed.statementDate);

  // B14 — continuity gate: the immediate predecessor statement's closing balance must equal this
  // statement's opening balance. Only checked when the exact predecessor (N-1) exists, so a
  // legitimately missing intermediate statement does not cause a false failure.
  const predecessor = await prisma.bankStatementImport.findFirst({
    where: {
      bankAccountId: bankAccount.id,
      statementNumber: parsed.statementNumber - 1,
      status: "PARSED",
    },
  });
  if (predecessor && predecessor.closingBalance !== parsed.prevBalance) {
    await prisma.bankStatementImport.create({
      data: {
        bankAccountId: bankAccount.id,
        statementNumber: parsed.statementNumber,
        statementDate,
        source,
        fileRef,
        openingBalance: parsed.prevBalance,
        totalDebit: parsed.totalDebit,
        totalCredit: parsed.totalCredit,
        closingBalance: parsed.newBalance,
        orderCount: parsed.orderCount ?? 0,
        status: "FAILED",
      },
    });
    const msg = `Континуитет: отворено ${parsed.prevBalance} ≠ претходно затворено ${predecessor.closingBalance} (извод ${predecessor.statementNumber})`;
    log.error(
      { event: "statement.integrity.failed", statementNumber: parsed.statementNumber },
      msg,
    );
    return { status: "FAILED", statementNumber: parsed.statementNumber, messages: [msg] };
  }

  // B14 — integrity gate: on failure record the import as FAILED and post nothing.
  if (!parsed.integrity.ok) {
    await prisma.bankStatementImport.create({
      data: {
        bankAccountId: bankAccount.id,
        statementNumber: parsed.statementNumber,
        statementDate,
        source,
        fileRef,
        openingBalance: parsed.prevBalance,
        totalDebit: parsed.totalDebit,
        totalCredit: parsed.totalCredit,
        closingBalance: parsed.newBalance,
        orderCount: parsed.orderCount ?? 0,
        status: "FAILED",
      },
    });
    return {
      status: "FAILED",
      statementNumber: parsed.statementNumber,
      messages: parsed.integrity.messages,
    };
  }

  let clientMatched = 0;
  await prisma.$transaction(async (tx) => {
    const imp = await tx.bankStatementImport.create({
      data: {
        bankAccountId: bankAccount.id,
        statementNumber: parsed.statementNumber!,
        statementDate,
        source,
        fileRef,
        openingBalance: parsed.prevBalance,
        totalDebit: parsed.totalDebit,
        totalCredit: parsed.totalCredit,
        closingBalance: parsed.newBalance,
        orderCount: parsed.orderCount ?? parsed.lines.length,
        status: "PARSED",
      },
    });

    const openCharges = await tx.charge.findMany({
      where: { kind: "INVOICE", invoiceNumber: { not: null }, status: { in: OPEN_STATUSES } },
    });
    const vendorRules = await tx.vendorRule.findMany();

    for (const line of parsed.lines) {
      // reference stores the matching key per type: FACEBK code (META_ADS) or повик (CLIENT_PAYMENT)
      const reference = line.classifiedAs === "META_ADS" ? line.facebkCode : line.reference;
      const sl = await tx.statementLine.create({
        data: {
          importId: imp.id,
          lineHash: line.lineHash,
          date: statementDate,
          amount: line.amount,
          direction: line.direction,
          description: line.merchant ?? line.facebkCode ?? line.reference ?? "",
          reference,
          bankRef: line.bankRef,
          counterpartyAccount: line.counterpartyAccount,
          classifiedAs: line.classifiedAs,
          processed: false,
        },
      });

      if (line.classifiedAs === "CLIENT_PAYMENT" && line.reference) {
        const norm = normalizeInvoiceRef(line.reference);
        const match = openCharges.find((c) => normalizeInvoiceRef(c.invoiceNumber!) === norm);
        const chargePeriod = match
          ? await tx.period.findUnique({ where: { id: match.period } })
          : null;
        if (match && chargePeriod?.status === "CLOSED") {
          // Late payment on a closed-period invoice — never mutate posted history (B9). Leave the
          // line unprocessed for manual handling (credit note / manual match) in the open period.
          log.warn(
            { event: "match.alarm", statementNumber: parsed.statementNumber, period: match.period },
            "уплата за фактура во затворен период — оставена нерешена",
          );
        } else if (match) {
          const remaining = match.total - match.paidAmount;
          const applied = Math.min(line.amount, Math.max(remaining, 0));
          const overpay = line.amount - applied;
          await tx.payment.create({
            data: {
              clientId: match.clientId,
              chargeId: match.id,
              channel: PayChannel.BANK,
              amount: applied,
              date: statementDate,
              reference: line.reference,
              matchStatus: MatchStatus.AUTO_MATCHED,
              statementLineId: sl.id,
            },
          });
          const newPaid = match.paidAmount + applied;
          await tx.charge.update({
            where: { id: match.id },
            data: {
              paidAmount: newPaid,
              status: newPaid >= match.total ? ChargeStatus.PAID : ChargeStatus.PARTIALLY_PAID,
            },
          });
          if (overpay > 0) {
            await tx.client.update({
              where: { id: match.clientId },
              data: { creditBalance: { increment: overpay } },
            }); // B18
          }
          await tx.statementLine.update({
            where: { id: sl.id },
            data: { processed: true, linkedType: "Charge", linkedId: match.id },
          });
          match.paidAmount = newPaid; // avoid re-matching within this statement
          clientMatched++;
        }
      } else if (line.classifiedAs === "CARD_TX" && line.merchant) {
        // SM-51: auto-categorize card purchases via VendorRule (e.g. PETROL → FUEL).
        const merchant = line.merchant.toUpperCase();
        const rule = vendorRules.find((r) => merchant.includes(r.pattern.toUpperCase()));
        if (rule) {
          const exp = await tx.expense.create({
            data: {
              category: rule.category,
              vendor: rule.vendor ?? line.merchant,
              amount: line.amount,
              date: statementDate,
              paymentChannel: PayChannel.CARD,
              isBillable: false,
              statementLineId: sl.id,
            },
          });
          await tx.vendorRule.update({ where: { id: rule.id }, data: { hits: { increment: 1 } } });
          await tx.statementLine.update({
            where: { id: sl.id },
            data: { processed: true, linkedType: "Expense", linkedId: exp.id },
          });
        }
      }
    }

    await writeAudit(tx, {
      entity: "BankStatementImport",
      entityId: imp.id,
      action: "ingest",
      diff: { statementNumber: parsed.statementNumber, lines: parsed.lines.length, clientMatched },
      userId,
    });
  });

  const receiptsMatched = await runMatching(userId);
  return {
    status: "PARSED",
    statementNumber: parsed.statementNumber,
    lines: parsed.lines.length,
    clientMatched,
    receiptsMatched,
  };
}

export type ReceiptIngest =
  | { status: "PARSED"; referenceNumber: string; matched: number }
  | { status: "DUPLICATE_SKIPPED"; referenceNumber: string }
  | { status: "PARTIAL"; message: string };

/** W2 — ingest a Meta receipt (§4.3): dedupe → persist AdSpendReceipt → attempt matching. */
export async function ingestReceipt(
  text: string,
  fileRef: string,
  userId: string,
): Promise<ReceiptIngest> {
  const p = parseMetaReceipt(text);
  if (!p.referenceNumber || p.amountUsdCents == null) {
    return { status: "PARTIAL", message: "Нецелосно парсирање — рачна редица." };
  }
  const dup = await prisma.adSpendReceipt.findFirst({
    where: { referenceNumber: p.referenceNumber },
  });
  if (dup) return { status: "DUPLICATE_SKIPPED", referenceNumber: p.referenceNumber };

  const invoiceDate = p.invoiceDate ? new Date(p.invoiceDate) : new Date();
  await prisma.adSpendReceipt.create({
    data: {
      emailMessageId: `upload:${p.referenceNumber}`,
      transactionId: p.transactionId ?? `upload-tx:${p.referenceNumber}`,
      metaInvoiceNo: p.metaInvoiceNo ?? `upload-inv:${p.referenceNumber}`,
      referenceNumber: p.referenceNumber,
      accountName: p.accountName ?? "",
      metaAccountId: p.metaAccountId,
      amountUsd: p.amountUsdCents,
      cardLast4: p.cardLast4 ?? "",
      invoiceDate: isNaN(invoiceDate.getTime()) ? new Date() : invoiceDate,
      attachmentUrl: fileRef,
      reverseChargeVat: p.reverseChargeVat,
      parseStatus: p.parseStatus,
      matchStatus: MatchStatus.UNMATCHED,
      receivedAt: new Date(),
    },
  });

  const matched = await runMatching(userId);
  return { status: "PARSED", referenceNumber: p.referenceNumber, matched };
}

/**
 * Matching (§4.4): unmatched Meta receipt ↔ unprocessed META_ADS statement line by
 * referenceNumber == FACEBK code (that alone). Books an Expense(ADS) at the MKD amount from the
 * statement, 1:1 (D3); billable iff the AdAccount maps to a client. USD rate is sanity-only.
 */
export async function runMatching(userId: string): Promise<number> {
  const receipts = await prisma.adSpendReceipt.findMany({
    where: { matchStatus: MatchStatus.UNMATCHED },
  });
  let matched = 0;

  for (const r of receipts) {
    const line = await prisma.statementLine.findFirst({
      where: { classifiedAs: "META_ADS", processed: false, reference: r.referenceNumber },
    });
    if (!line) continue;

    // §4.4 rate sanity: the booked MKD (always the statement amount, D3) vs USD × НБРМ mid.
    // Outside ±6% → alarm for manual confirm; the booked amount itself is never affected.
    let rateSanityOk = true;
    if (r.amountUsd > 0) {
      const rate = await prisma.exchangeRate.findFirst({
        where: { code: "USD", date: { lte: line.date } },
        orderBy: { date: "desc" },
      });
      if (rate && rate.midMkd > 0) {
        const impliedRate = line.amount / r.amountUsd; // MKD per USD (the ×100 units cancel)
        rateSanityOk = Math.abs(impliedRate - rate.midMkd) / rate.midMkd <= RATE_SANITY_BAND;
        if (!rateSanityOk) {
          log.warn(
            {
              event: "match.alarm",
              referenceNumber: r.referenceNumber,
              impliedRate,
              mid: rate.midMkd,
            },
            "USD/MKD курс надвор од ±6% — потребна рачна потврда",
          );
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      const adAccount = r.metaAccountId
        ? await tx.adAccount.findUnique({ where: { metaAccountId: r.metaAccountId } })
        : null;
      const clientId = adAccount?.clientId ?? null;

      const expense = await tx.expense.create({
        data: {
          category: ExpenseCategory.ADS,
          vendor: "Meta",
          amount: line.amount, // MKD from the statement, 1:1 (D3)
          date: line.date,
          paymentChannel: PayChannel.CARD,
          clientId,
          isBillable: clientId != null, // B2: billable ADS needs a client
          attachmentUrl: r.attachmentUrl, // the Meta PDF — legal document
          statementLineId: line.id,
          adSpendReceiptId: r.id,
        },
      });
      await tx.adSpendReceipt.update({
        where: { id: r.id },
        data: { matchStatus: MatchStatus.AUTO_MATCHED, statementLineId: line.id },
      });
      await tx.statementLine.update({
        where: { id: line.id },
        data: {
          processed: true,
          direction: Direction.OUT,
          linkedType: "Expense",
          linkedId: expense.id,
        },
      });
      await writeAudit(tx, {
        entity: "AdSpendReceipt",
        entityId: r.id,
        action: "match.auto",
        diff: {
          referenceNumber: r.referenceNumber,
          amountMkd: line.amount,
          clientId,
          rateSanityOk,
        },
        userId,
      });
    });
    matched++;
  }
  return matched;
}

/**
 * Manual resolution of an unprocessed CLIENT_PAYMENT statement line against a chosen open charge
 * (§9.4 import queue). Applies the bank payment, updates the charge, routes overpayment to credit
 * (B18). Period-guarded (B9) and idempotent (a processed line is rejected).
 */
export async function manualMatchStatementLine(lineId: string, chargeId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line || line.processed) throw new Error("Линијата не постои или е веќе решена.");
    const charge = await tx.charge.findUnique({ where: { id: chargeId } });
    if (!charge) throw new Error("Задолжувањето не постои.");
    await assertPeriodOpen(tx, charge.period); // B9

    const remaining = charge.total - charge.paidAmount;
    const applied = Math.min(line.amount, Math.max(remaining, 0));
    const overpay = line.amount - applied;
    await tx.payment.create({
      data: {
        clientId: charge.clientId,
        chargeId: charge.id,
        channel: PayChannel.BANK,
        amount: applied,
        date: line.date,
        reference: line.reference,
        matchStatus: MatchStatus.MANUAL_MATCHED,
        statementLineId: line.id,
      },
    });
    const newPaid = charge.paidAmount + applied;
    await tx.charge.update({
      where: { id: charge.id },
      data: {
        paidAmount: newPaid,
        status: newPaid >= charge.total ? ChargeStatus.PAID : ChargeStatus.PARTIALLY_PAID,
      },
    });
    if (overpay > 0) {
      await tx.client.update({
        where: { id: charge.clientId },
        data: { creditBalance: { increment: overpay } },
      });
    }
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, linkedType: "Charge", linkedId: charge.id },
    });
    await writeAudit(tx, {
      entity: "StatementLine",
      entityId: line.id,
      action: "match.manual",
      diff: { chargeId, applied },
      userId,
    });
  });
}

/** Mark a noise statement line (BANK_FEE / OTHER / uncategorized CARD_TX) resolved without booking. */
export async function ignoreStatementLine(lineId: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line || line.processed) return;
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, linkedType: "Ignored" },
    });
    await writeAudit(tx, {
      entity: "StatementLine",
      entityId: line.id,
      action: "line.ignored",
      diff: { amount: line.amount, classifiedAs: line.classifiedAs },
      userId,
    });
  });
}
