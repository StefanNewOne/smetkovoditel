import "server-only";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { type NlbLine, type NlbStatement, parseNlbStatement } from "@smetko/shared";

/**
 * Positional NLB parser (SM-80). `pdf-parse` flattens the Задолжување / Побарување columns, so the
 * text-only parser can only GUESS a line's direction (it fails the integrity gate on ~20% of real
 * Тутунска statements). Here we read the token X-coordinates: a transaction amount sits in the
 * debit column (x < THRESHOLD) or the credit column (x ≥ THRESHOLD), which is authoritative.
 * Header fields (numbers, balances, date, account) come from the reliable text parser; only the
 * lines + direction are rebuilt from positions. Validated: Σ debit / Σ credit match the header on
 * all 152 real statements (146/149 golden still covered by the text parser).
 */

// Classification regexes (mirror @smetko/shared parser — direction-independent).
const OWN_ACCOUNT = "210-0768360001-38";
const MONEY = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const SIFRA = /^\d{1,3}$/;
const FACEBK = /FACEBK\s*\*+\s*([A-Z0-9]{6,})/;
const INVOICE_REF = /(\d-\d{1,4}\/\d{4})/;
const ACCOUNT = /(\d{3}-\d{10}-\d{2})/g;
const ACCOUNT_TOKEN = /^\d{3}-\d{10}-\d{2}$/;
const CARD = /MBDP:(\d{4}):/;
const BANK_REF = /(87BXS\d+)/;
/** Debit column ≈ x275–290, credit column ≈ x355–365 → split at 325 (validated on 152 statements). */
const COLUMN_THRESHOLD = 325;

const den = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

interface Tok {
  x: number;
  y: number;
  s: string;
}

// pdf-parse accepts a `pagerender` callback at runtime (its bundled types omit it). A typed
// wrapper exposes it + the pdf.js text-content shape without resorting to `any`.
interface TextItem {
  transform: number[];
  str: string;
}
interface PdfPage {
  getTextContent: () => Promise<{ items: TextItem[] }>;
}
const pdfParseWithRender = pdfParse as unknown as (
  buf: Buffer,
  opts: { pagerender: (page: PdfPage) => Promise<string> },
) => Promise<{ text: string }>;

async function positioned(buf: Buffer): Promise<Tok[]> {
  const toks: Tok[] = [];
  // pdf.js Y-coordinates reset per page; offset each page downward so pages don't collide when
  // clustered and stay in reading order (page 1 above page 2).
  let pageIdx = 0;
  await pdfParseWithRender(buf, {
    pagerender: (page) => {
      const offset = pageIdx-- * 100_000;
      return page.getTextContent().then((tc) => {
        for (const it of tc.items)
          toks.push({
            x: Math.round(it.transform[4]!),
            y: Math.round(it.transform[5]!) + offset,
            s: String(it.str).trim(),
          });
        return "";
      });
    },
  });
  return toks;
}

/** A NLB transaction's name / amount / повик / account sit on near-identical baselines (Δy < ~5),
 *  so tokens are clustered into a logical row with this Y tolerance — well under the ~36 between
 *  transactions. That reunites the amount with its повикување / FACEBK / account for classification. */
const Y_TOLERANCE = 8;
/** Vertical window (± units) for gathering a transaction's classification tokens — comfortably
 *  under the ~36 between transactions, so only this transaction's rows are captured. */
const CLASSIFY_WINDOW = 14;
/** Wider window for the повикување на број token (the closest one to the amount wins). */
const REF_WINDOW = 30;

function buildLines(toks: Tok[], statementNumber: number | null): NlbLine[] {
  const sorted = [...toks].sort((a, b) => b.y - a.y);
  const rows: Tok[][] = [];
  let cur: Tok[] = [];
  let top = Infinity;
  for (const t of sorted) {
    if (top - t.y > Y_TOLERANCE) {
      if (cur.length) rows.push(cur);
      cur = [];
      top = t.y;
    }
    cur.push(t);
  }
  if (cur.length) rows.push(cur);

  const lines: NlbLine[] = [];
  let seq = 0;
  for (const raw of rows) {
    const row = raw.sort((a, b) => a.x - b.x);
    // A transaction row carries exactly ONE money token (its amount). The header (prev/debit/
    // credit/new) and the "Вкупно денари" footer (debit+credit totals) carry ≥2 — skip them.
    if (row.filter((t) => MONEY.test(t.s)).length >= 2) continue;
    // amount = a money token with a 1–3 digit шифра to its right (the шифра column ~x404).
    const amtIdx = row.findIndex(
      (t, i) => MONEY.test(t.s) && row.some((u, j) => j > i && u.x > t.x && SIFRA.test(u.s)),
    );
    if (amtIdx < 0) continue;
    const amtTok = row[amtIdx]!;
    const amount = den(amtTok.s);
    const direction: "IN" | "OUT" = amtTok.x < COLUMN_THRESHOLD ? "OUT" : "IN";
    const sifra = row.find((u, j) => j > amtIdx && u.x > amtTok.x && SIFRA.test(u.s))!.s;
    // Classification uses a WIDER vertical window around the amount (< the ~36 between transactions)
    // so a повикување / FACEBK / account on a nearby baseline is captured even if it fell outside
    // the tight amount cluster. Amount detection stays cluster-based → integrity is unaffected.
    const joined = toks
      .filter((t) => Math.abs(t.y - amtTok.y) <= CLASSIFY_WINDOW)
      .sort((a, b) => a.x - b.x)
      .map((t) => t.s)
      .join(" ");

    const facebkCode = joined.match(FACEBK)?.[1] ?? null;
    const cardLast4 = joined.match(CARD)?.[1] ?? null;
    // повикување на број: pick the invoice-ref token CLOSEST (in y) to the amount, over a wider
    // window — safe against grabbing a neighbouring transaction's повик (the nearest one wins).
    const refTok = toks
      .filter((t) => Math.abs(t.y - amtTok.y) <= REF_WINDOW && /^\d-\d{1,4}\/\d{4}$/.test(t.s))
      .sort((a, b) => Math.abs(a.y - amtTok.y) - Math.abs(b.y - amtTok.y))[0];
    const reference = refTok?.s ?? joined.match(INVOICE_REF)?.[1] ?? null;
    const bankRef = joined.match(BANK_REF)?.[1] ?? null;
    const accounts = [...joined.matchAll(ACCOUNT)]
      .map((m) => m[1]!)
      .filter((a) => a !== OWN_ACCOUNT);
    const hashAccount = accounts[0] ?? null; // narrow window — feeds lineHash (kept byte-stable)
    // SM-101: the payer account of an incoming transfer renders at/below the amount and can WRAP to
    // the top of the next page (out of any y-window — the ±100k per-page offset makes it unreachable).
    // Scan forward in reading order for the nearest account token before the next money token, so a
    // page-straddling transaction still resolves its account. Stored counterparty only, never the
    // hash — suggestion metadata, human-confirmed, so a stray pick never auto-books.
    let payerAccount: string | null = null;
    const amtPos = sorted.indexOf(amtTok);
    for (let i = amtPos + 1; i < sorted.length; i++) {
      const t = sorted[i]!;
      if (MONEY.test(t.s)) break; // reached the next transaction / footer total
      if (ACCOUNT_TOKEN.test(t.s) && t.s !== OWN_ACCOUNT) {
        payerAccount = t.s;
        break;
      }
    }
    const counterpartyAccount = payerAccount ?? hashAccount;

    let classifiedAs: NlbLine["classifiedAs"];
    if (facebkCode) classifiedAs = "META_ADS";
    else if (reference) classifiedAs = "CLIENT_PAYMENT";
    else if (cardLast4) classifiedAs = "CARD_TX";
    else classifiedAs = "OTHER";

    let merchant: string | null = null;
    if (classifiedAs === "CARD_TX")
      merchant =
        joined
          .replace(/.*MBDP:\d{4}:\w+\s*/, "")
          .replace(/\s+87BXS.*/, "")
          .trim() || null;

    seq++;
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
        hashAccount ?? "", // narrow account — lineHash stays identical to pre-SM-82 (dedupe/backfill)
      ].join("|"),
    });
  }
  return lines;
}

/** Parse an NLB statement PDF with column-aware direction. */
export async function parseNlbFromPdf(buffer: Buffer): Promise<NlbStatement> {
  const { text } = await pdfParse(buffer);
  const base = parseNlbStatement(text); // reliable header (numbers, balances, date, account, counts)
  const toks = await positioned(buffer);
  const lines = buildLines(toks, base.statementNumber);

  const sumOut = lines.filter((l) => l.direction === "OUT").reduce((s, l) => s + l.amount, 0);
  const sumIn = lines.filter((l) => l.direction === "IN").reduce((s, l) => s + l.amount, 0);
  const balanceOk = base.prevBalance - base.totalDebit + base.totalCredit === base.newBalance;
  const debitOk = sumOut === base.totalDebit;
  const creditOk = sumIn === base.totalCredit;
  const countOk = base.orderCount != null && lines.length === base.orderCount;
  const messages: string[] = [];
  if (!balanceOk)
    messages.push(
      `Салдо: ${base.prevBalance} − ${base.totalDebit} + ${base.totalCredit} ≠ ${base.newBalance}`,
    );
  if (!debitOk) messages.push(`Долгува: Σ OUT ${sumOut} ≠ ${base.totalDebit}`);
  if (!creditOk) messages.push(`Побарува: Σ IN ${sumIn} ≠ ${base.totalCredit}`);
  if (!countOk) messages.push(`Налози: ${lines.length} ≠ ${base.orderCount}`);
  const ok = balanceOk && debitOk && creditOk && countOk;

  return {
    ...base,
    lines,
    integrity: { ok, balanceOk, debitOk, creditOk, countOk, messages },
    parseStatus: ok ? "OK" : "FAILED",
  };
}
