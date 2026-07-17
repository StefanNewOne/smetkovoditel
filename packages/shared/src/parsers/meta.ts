/**
 * Meta Ads receipt parser (Master Plan §4.3). Pure: text → structured. The referenceNumber is
 * the matching key (§4.4). amountUsd is cents — USD is USED ONLY for the ±6% rate sanity, never
 * booked (D3). Incomplete → PARTIAL (manual queue).
 */
export interface MetaReceipt {
  accountName: string | null;
  metaAccountId: string | null;
  referenceNumber: string | null;
  transactionId: string | null;
  amountUsdCents: number | null;
  metaInvoiceNo: string | null;
  cardLast4: string | null;
  invoiceDate: string | null;
  reverseChargeVat: boolean;
  parseStatus: "OK" | "PARTIAL";
}

export function parseMetaReceipt(text: string): MetaReceipt {
  const accountName = text.match(/^Receipt for (.+)$/m)?.[1]?.trim() ?? null;
  const metaAccountId = text.match(/Account ID:\s*(\d+)/)?.[1] ?? null;
  const referenceNumber = text.match(/Reference Number:\s*([A-Z0-9]+)/)?.[1] ?? null;
  const transactionId = text.match(/Transaction ID\s*\n\s*([\d-]+)/)?.[1] ?? null;
  const metaInvoiceNo = text.match(/Invoice #\s*(FBADS-[\d-]+)/)?.[1] ?? null;
  const cardLast4 = text.match(/(?:MasterCard|Visa)[^\d]*(\d{4})/)?.[1] ?? null;
  const invoiceDate = text.match(/Invoice\/Payment Date\s*\n\s*(.+)/)?.[1]?.trim() ?? null;

  // Amount: the first "$…" after the "Paid" marker (§4.3).
  const paidIdx = text.indexOf("Paid");
  const scope = paidIdx >= 0 ? text.slice(paidIdx) : text;
  const amtStr = scope.match(/\$([0-9,]+\.\d{2})/)?.[1] ?? null;
  const amountUsdCents = amtStr ? Math.round(Number(amtStr.replace(/,/g, "")) * 100) : null;

  // Ireland VAT → reverse charge in MK (§ Meta pipeline).
  const reverseChargeVat = /Ireland|IE\s?\d/.test(text);

  const complete = !!(accountName && referenceNumber && amountUsdCents != null && metaInvoiceNo);
  return {
    accountName,
    metaAccountId,
    referenceNumber,
    transactionId,
    amountUsdCents,
    metaInvoiceNo,
    cardLast4,
    invoiceDate,
    reverseChargeVat,
    parseStatus: complete ? "OK" : "PARTIAL",
  };
}
