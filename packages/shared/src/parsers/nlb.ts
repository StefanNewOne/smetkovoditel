import { parseDenari } from "../money";

/**
 * NLB statement parser (Master Plan §4.2, adapter NLB_PDF). Pure: extracted PDF text → structured.
 * The bank's font garbles Cyrillic on extraction, but every field needed for booking/matching is
 * ASCII (amounts, шифра, FACEBK codes, повикување на број, accounts) and survives intact. Line
 * direction is derived from classification (§4.2) and then SELF-VALIDATED against the header
 * debit/credit totals + balance equation (B14): if classification is wrong, integrity fails and
 * nothing is posted (§13).
 */

export type LineClass = "META_ADS" | "CARD_TX" | "CLIENT_PAYMENT" | "BANK_FEE" | "OTHER";

export interface NlbLine {
  seq: number;
  amount: number; // дени
  direction: "IN" | "OUT";
  sifra: string;
  classifiedAs: LineClass;
  facebkCode: string | null; // referenceNumber for META_ADS matching
  reference: string | null; // повикување на број (invoice) for CLIENT_PAYMENT
  counterpartyAccount: string | null;
  cardLast4: string | null;
  merchant: string | null; // raw purpose text (for VendorRule / CARD_TX)
  bankRef: string | null; // податоци за рекламација
  lineHash: string; // B13 dedupe key
}

export interface NlbIntegrity {
  ok: boolean;
  balanceOk: boolean;
  debitOk: boolean;
  creditOk: boolean;
  countOk: boolean;
  messages: string[];
}

export interface NlbStatement {
  statementNumber: number | null;
  statementDate: string | null;
  account: string | null;
  prevBalance: number;
  totalDebit: number;
  totalCredit: number;
  newBalance: number;
  orderCount: number | null;
  lines: NlbLine[];
  integrity: NlbIntegrity;
  parseStatus: "OK" | "PARTIAL" | "FAILED";
}

const OWN_ACCOUNT = "210-0768360001-38"; // D1
const MONEY = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
const AMOUNT_SIFRA = /(\d{1,3}(?:\.\d{3})*,\d{2})(\d{3})/; // amount immediately followed by шифра
const FACEBK = /FACEBK\s*\*+\s*([A-Z0-9]{6,})/;
const INVOICE_REF = /(\d-\d{1,4}\/\d{4})/; // повикување на број, e.g. 1-66/2026
const ACCOUNT = /(\d{3}-\d{10}-\d{2})/g;
const CARD = /MBDP:(\d{4}):/;
const BANK_REF = /(87BXS\d+)/;

function den(s: string): number {
  return parseDenari(s);
}

export function parseNlbStatement(text: string): NlbStatement {
  const rawLines = text.split("\n").map((l) => l.trim());
  const nonEmpty = rawLines.filter((l) => l.length > 0);

  // ── Header: first line carrying ≥4 money values → prev, debit, credit, new ──
  const headerLine = nonEmpty.find((l) => (l.match(MONEY) ?? []).length >= 4);
  const headerNums = headerLine?.match(MONEY) ?? [];
  const prevBalance = headerNums[0] ? den(headerNums[0]) : 0;
  const totalDebit = headerNums[1] ? den(headerNums[1]) : 0;
  const totalCredit = headerNums[2] ? den(headerNums[2]) : 0;
  const newBalance = headerNums[3] ? den(headerNums[3]) : 0;

  const statementDate = text.match(/(\d{2}\.\d{2}\.\d{4})/)?.[1] ?? null;

  // ── orderCount: first number after the LAST own-account occurrence ("има N налози") ──
  const lastAcctIdx = text.lastIndexOf(OWN_ACCOUNT);
  const orderCount =
    lastAcctIdx >= 0
      ? (text.slice(lastAcctIdx + OWN_ACCOUNT.length).match(/(\d+)/)?.[1] ?? null)
      : null;

  // ── statementNumber: trailing digits of a line just above the first own-account block ──
  const firstAcctLine = rawLines.findIndex((l) => l.includes(OWN_ACCOUNT));
  let statementNumber: number | null = null;
  for (let i = firstAcctLine - 1; i >= 0 && i > firstAcctLine - 6; i--) {
    const line = rawLines[i] ?? "";
    if (line.match(MONEY)) continue; // skip money lines
    const m = line.match(/(\d{1,6})\s*$/);
    if (m) {
      statementNumber = Number(m[1]);
      break;
    }
  }

  // ── Transaction blocks: delimited by row-number-only lines ("1","2",…) ──
  const lines: NlbLine[] = [];
  let block: string[] = [];
  let seq = 0;

  const flush = () => {
    if (!seq) return;
    const joined = block.join(" ");
    const amtM = joined.match(AMOUNT_SIFRA);
    if (!amtM) {
      block = [];
      return;
    }
    const amount = den(amtM[1]!);
    const sifra = amtM[2]!;
    const facebkCode = joined.match(FACEBK)?.[1] ?? null;
    const cardLast4 = joined.match(CARD)?.[1] ?? null;
    const reference = joined.match(INVOICE_REF)?.[1] ?? null;
    const bankRef = joined.match(BANK_REF)?.[1] ?? null;
    const accounts = [...joined.matchAll(ACCOUNT)]
      .map((m) => m[1]!)
      .filter((a) => a !== OWN_ACCOUNT);
    const counterpartyAccount = accounts[0] ?? null;

    let classifiedAs: LineClass;
    let direction: "IN" | "OUT";
    if (facebkCode) {
      classifiedAs = "META_ADS";
      direction = "OUT";
    } else if (reference) {
      classifiedAs = "CLIENT_PAYMENT";
      direction = "IN";
    } else if (cardLast4) {
      classifiedAs = "CARD_TX";
      direction = "OUT";
    } else {
      classifiedAs = "OTHER";
      direction = "OUT";
    }

    // Merchant text for CARD_TX: purpose after the "MBDP:####:CODE " prefix.
    let merchant: string | null = null;
    if (classifiedAs === "CARD_TX") {
      merchant =
        joined
          .replace(/.*MBDP:\d{4}:\w+\s*/, "")
          .replace(/\s+87BXS.*/, "")
          .trim() || null;
    }

    lines.push({
      seq,
      amount,
      direction,
      sifra,
      classifiedAs,
      facebkCode,
      reference,
      counterpartyAccount,
      cardLast4,
      merchant,
      bankRef,
      lineHash: [
        statementNumber,
        seq,
        amount,
        direction,
        facebkCode ?? reference ?? merchant ?? "",
        counterpartyAccount ?? "",
      ].join("|"),
    });
    block = [];
  };

  for (const line of nonEmpty) {
    if (/^\d{1,3}$/.test(line) && Number(line) === seq + 1) {
      flush();
      seq = Number(line);
    } else if (seq) {
      // Stop collecting once we hit the totals/footer (a line with ≥2 money values after blocks).
      if ((line.match(MONEY) ?? []).length >= 2 && line !== headerLine) {
        flush();
        seq = 0;
      } else {
        block.push(line);
      }
    }
  }
  flush();

  // ── Integrity gate (B14) ──
  const sumOut = lines.filter((l) => l.direction === "OUT").reduce((s, l) => s + l.amount, 0);
  const sumIn = lines.filter((l) => l.direction === "IN").reduce((s, l) => s + l.amount, 0);
  const balanceOk = prevBalance - totalDebit + totalCredit === newBalance;
  const debitOk = sumOut === totalDebit;
  const creditOk = sumIn === totalCredit;
  const countOk = orderCount != null && lines.length === Number(orderCount);

  const messages: string[] = [];
  if (!balanceOk)
    messages.push(`Салдо: ${prevBalance} − ${totalDebit} + ${totalCredit} ≠ ${newBalance}`);
  if (!debitOk) messages.push(`Долгува: Σ OUT ${sumOut} ≠ ${totalDebit}`);
  if (!creditOk) messages.push(`Побарува: Σ IN ${sumIn} ≠ ${totalCredit}`);
  if (!countOk) messages.push(`Налози: ${lines.length} ≠ ${orderCount}`);

  const ok = balanceOk && debitOk && creditOk && countOk;
  const parseStatus = ok ? "OK" : "FAILED";

  return {
    statementNumber,
    statementDate,
    account: OWN_ACCOUNT,
    prevBalance,
    totalDebit,
    totalCredit,
    newBalance,
    orderCount: orderCount != null ? Number(orderCount) : null,
    lines,
    integrity: { ok, balanceOk, debitOk, creditOk, countOk, messages },
    parseStatus,
  };
}
