import "server-only";
import {
  ChargeKind,
  ChargeStatus,
  Direction,
  type ImportSource,
  MatchStatus,
  PayChannel,
  Prisma,
  prisma,
} from "@smetko/db";
import pino from "pino";
import {
  type NlbStatement,
  normalizeInvoiceRef,
  parseMetaReceipt,
  parseNlbStatement,
} from "@smetko/shared";
import { writeAudit } from "@/lib/audit";
import { parseNlbFromPdf } from "@/lib/pdf/nlb-parse";
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
/** Ingest from a PDF buffer using the column-aware positional parser (real statements). */
/**
 * FIFO settlement (go-live Part 2B) — an incoming payment with no matched повикување is applied to
 * the payer's OLDEST open invoice, the payer identified by the giro account (ClientBankAccount), so
 * payments don't pile up in Решавање. Overpayment → creditBalance (B18); if the client has no open
 * invoice the whole amount goes to credit. Closed-period invoices are never touched (B9). Runs
 * inside the caller's transaction; returns true if it settled the line.
 */
async function settleOldestByAccount(
  tx: Prisma.TransactionClient,
  lineId: string,
  amount: number,
  date: Date,
  reference: string | null,
  userId: string,
): Promise<boolean> {
  const line = await tx.statementLine.findUnique({ where: { id: lineId } });
  if (!line || line.processed || !line.counterpartyAccount) return false;
  const acc = await tx.clientBankAccount.findUnique({
    where: { account: line.counterpartyAccount },
  });
  if (!acc) return false;

  const charge = await tx.charge.findFirst({
    where: {
      clientId: acc.clientId,
      kind: ChargeKind.INVOICE,
      invoiceNumber: { not: null },
      status: { in: [ChargeStatus.OPEN, ChargeStatus.PARTIALLY_PAID, ChargeStatus.OVERDUE] },
    },
    orderBy: [{ period: "asc" }, { seqInMonth: "asc" }], // oldest first
  });

  if (!charge) {
    // known payer, no open invoice → whole amount to credit (B18)
    await tx.client.update({
      where: { id: acc.clientId },
      data: { creditBalance: { increment: amount } },
    });
    await tx.statementLine.update({
      where: { id: lineId },
      data: { processed: true, linkedType: "Credit" },
    });
    await writeAudit(tx, {
      entity: "StatementLine",
      entityId: lineId,
      action: "match.fifo.credit",
      diff: { clientId: acc.clientId, amount },
      userId,
    });
    return true;
  }

  const period = await tx.period.findUnique({ where: { id: charge.period } });
  if (period?.status === "CLOSED") return false; // never mutate posted history (B9)

  const remaining = charge.total - charge.paidAmount;
  const applied = Math.min(amount, Math.max(remaining, 0));
  const overpay = amount - applied;
  await tx.payment.create({
    data: {
      clientId: acc.clientId,
      chargeId: charge.id,
      channel: PayChannel.BANK,
      amount: applied,
      date,
      reference,
      matchStatus: MatchStatus.AUTO_MATCHED,
      statementLineId: lineId,
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
  if (overpay > 0)
    await tx.client.update({
      where: { id: acc.clientId },
      data: { creditBalance: { increment: overpay } },
    });
  await tx.statementLine.update({
    where: { id: lineId },
    data: { processed: true, linkedType: "Charge", linkedId: charge.id },
  });
  await writeAudit(tx, {
    entity: "StatementLine",
    entityId: lineId,
    action: "match.fifo",
    diff: { clientId: acc.clientId, chargeId: charge.id, applied },
    userId,
  });
  return true;
}

/** Run FIFO settlement over all currently-unmatched incoming lines (go-live one-off + safety net). */
export async function runFifoOnUnmatched(userId: string): Promise<number> {
  const lines = await prisma.statementLine.findMany({
    where: { processed: false, direction: "IN" },
    orderBy: { date: "asc" },
    select: { id: true, amount: true, date: true, reference: true },
  });
  let settled = 0;
  for (const l of lines) {
    const ok = await prisma.$transaction((tx) =>
      settleOldestByAccount(tx, l.id, l.amount, l.date, l.reference, userId),
    );
    if (ok) settled++;
  }
  return settled;
}

/**
 * SM-99 phase B — link a payer's giro account to a client from a Решавање row, then run FIFO so the
 * payment(s) from that account settle the client's oldest open invoice (generalizes the manual
 * account→client fix into the UI). Future payments from the same account auto-settle on import.
 */
export async function linkAccountAndSettle(
  lineId: string,
  clientId: string,
  userId: string,
): Promise<{ settled: number }> {
  const line = await prisma.statementLine.findUnique({ where: { id: lineId } });
  const account = line?.counterpartyAccount;
  if (!account) throw new Error("Линијата нема сметка на плаќач за поврзување.");
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error("Клиентот не постои.");

  await prisma.$transaction(async (tx) => {
    await tx.clientBankAccount.upsert({
      where: { account },
      update: { clientId },
      create: { clientId, account, label: "Плаќачка сметка" },
    });
    await writeAudit(tx, {
      entity: "ClientBankAccount",
      entityId: account,
      action: "account.linked",
      diff: { clientId, lineId },
      userId,
    });
  });

  const settled = await runFifoOnUnmatched(userId);
  return { settled };
}

export async function ingestStatementPdf(
  buffer: Buffer,
  fileRef: string,
  source: ImportSource,
  userId: string,
): Promise<StatementIngest> {
  return ingestParsedStatement(await parseNlbFromPdf(buffer), fileRef, source, userId);
}

/** Ingest from extracted text (golden/redacted fixtures + tests; direction from classification). */
export async function ingestStatement(
  text: string,
  fileRef: string,
  source: ImportSource,
  userId: string,
): Promise<StatementIngest> {
  return ingestParsedStatement(parseNlbStatement(text), fileRef, source, userId);
}

export async function ingestParsedStatement(
  parsed: NlbStatement,
  fileRef: string,
  source: ImportSource,
  userId: string,
): Promise<StatementIngest> {
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
      } else if (
        line.direction === Direction.OUT &&
        (line.classifiedAs === "CARD_TX" || line.classifiedAs === "OTHER")
      ) {
        // SM-51/SM-100: auto-categorize via VendorRule — by card merchant (substring) or, for a
        // transfer with no merchant, by the exact recipient account (learned account→vendor memory).
        const merchant = (line.merchant ?? "").toUpperCase();
        const rule = vendorRules.find(
          (r) =>
            (merchant.length > 0 && merchant.includes(r.pattern.toUpperCase())) ||
            (!!line.counterpartyAccount && r.pattern === line.counterpartyAccount),
        );
        if (rule) {
          const exp = await tx.expense.create({
            data: {
              category: rule.category,
              vendor: rule.vendor ?? line.merchant ?? line.counterpartyAccount,
              amount: line.amount,
              date: statementDate,
              paymentChannel: line.classifiedAs === "CARD_TX" ? PayChannel.CARD : PayChannel.BANK,
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

      // FIFO (Part 2B): an incoming line still unmatched → settle the payer's oldest open invoice
      // by giro account, so it never piles up in Решавање.
      if (line.direction === Direction.IN) {
        const cur = await tx.statementLine.findUnique({
          where: { id: sl.id },
          select: { processed: true },
        });
        if (
          !cur?.processed &&
          (await settleOldestByAccount(
            tx,
            sl.id,
            line.amount,
            statementDate,
            line.reference,
            userId,
          ))
        )
          clientMatched++;
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
          category: "ADS",
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

export interface CategorizeResult {
  expenseId: string;
  learnedRule: boolean;
  siblingMatches: number; // other pending OUT lines the learned rule would also catch (info only)
}

/** period id "YYYY-MM" from a statement-line date (booking period of the expense). */
const periodOfDate = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Resolve an outgoing statement line as an operating Expense (§4.2). Card/bank expense — the NLB
 * statement IS the document, so no photo is required (B6). Atomic + audited, period-guarded (B9),
 * idempotent (an already-processed line is rejected). With `rememberVendor`, learns a VendorRule so
 * future imports auto-categorize the same merchant (the existing §4.2 CARD_TX pipeline).
 */
export async function categorizeStatementLine(
  lineId: string,
  category: string, // Category.key (SM-99)
  opts: { rememberVendor?: boolean },
  userId: string,
): Promise<CategorizeResult> {
  return prisma.$transaction(async (tx) => {
    const line = await tx.statementLine.findUnique({ where: { id: lineId } });
    if (!line || line.processed) throw new Error("Линијата не постои или е веќе решена.");
    if (line.direction !== Direction.OUT) throw new Error("Само излезни линии се трошоци.");
    await assertPeriodOpen(tx, periodOfDate(line.date)); // B9

    const vendor = line.counterpartyName ?? line.description ?? null;
    const exp = await tx.expense.create({
      data: {
        category,
        vendor,
        amount: line.amount, // денари, from the statement (B10)
        date: line.date,
        paymentChannel: line.classifiedAs === "CARD_TX" ? PayChannel.CARD : PayChannel.BANK,
        isBillable: false, // agency operating cost; the card/bank statement is the record (B6)
        statementLineId: line.id,
      },
    });
    await tx.statementLine.update({
      where: { id: line.id },
      data: { processed: true, linkedType: "Expense", linkedId: exp.id },
    });

    let learnedRule = false;
    let siblingMatches = 0;
    const pattern = (vendor ?? "").trim().toUpperCase();
    if (opts.rememberVendor && pattern.length >= 3) {
      // VendorRule matches by `merchant.includes(pattern)` on import (§4.2). Dedupe on (pattern, category).
      const existing = await tx.vendorRule.findFirst({ where: { pattern, category } });
      if (!existing) {
        await tx.vendorRule.create({ data: { pattern, category, vendor } });
        learnedRule = true;
      }
      const pending = await tx.statementLine.findMany({
        where: { processed: false, direction: Direction.OUT, id: { not: line.id } },
        select: { counterpartyName: true, description: true },
      });
      siblingMatches = pending.filter((p) =>
        `${p.counterpartyName ?? ""} ${p.description ?? ""}`.toUpperCase().includes(pattern),
      ).length;
    }

    log.info(
      { event: "line.classified", statementLineId: line.id, category, learnedRule },
      "извод-линија категоризирана како трошок",
    );
    await writeAudit(tx, {
      entity: "StatementLine",
      entityId: line.id,
      action: "line.categorized",
      diff: { category, amount: line.amount, expenseId: exp.id, learnedRule },
      userId,
    });
    return { expenseId: exp.id, learnedRule, siblingMatches };
  });
}

/**
 * SM-99 phase C — categorize many outgoing lines (a merchant/account group) as one category in a
 * single transaction, optionally learning ONE VendorRule from the group's pattern (merchant token
 * for card groups, account number for transfer groups) so future imports auto-categorize them.
 * Skips already-processed / non-OUT lines; period-guarded (B9) per line.
 */
export async function bulkCategorizeLines(
  lineIds: string[],
  category: string,
  learnPattern: string | null,
  userId: string,
): Promise<{ categorized: number; learnedRule: boolean }> {
  return prisma.$transaction(async (tx) => {
    let categorized = 0;
    for (const id of lineIds) {
      const line = await tx.statementLine.findUnique({ where: { id } });
      if (!line || line.processed || line.direction !== Direction.OUT) continue;
      await assertPeriodOpen(tx, periodOfDate(line.date)); // B9
      const exp = await tx.expense.create({
        data: {
          category,
          vendor: line.counterpartyName ?? line.description ?? line.counterpartyAccount,
          amount: line.amount,
          date: line.date,
          paymentChannel: line.classifiedAs === "CARD_TX" ? PayChannel.CARD : PayChannel.BANK,
          isBillable: false,
          statementLineId: line.id,
        },
      });
      await tx.statementLine.update({
        where: { id: line.id },
        data: { processed: true, linkedType: "Expense", linkedId: exp.id },
      });
      await writeAudit(tx, {
        entity: "StatementLine",
        entityId: line.id,
        action: "line.categorized",
        diff: { category, amount: line.amount, expenseId: exp.id, bulk: true },
        userId,
      });
      categorized++;
    }

    let learnedRule = false;
    const pattern = (learnPattern ?? "").trim().toUpperCase();
    if (pattern.length >= 3) {
      const existing = await tx.vendorRule.findFirst({ where: { pattern, category } });
      if (!existing) {
        await tx.vendorRule.create({ data: { pattern, category, vendor: learnPattern } });
        learnedRule = true;
      }
    }
    return { categorized, learnedRule };
  });
}
