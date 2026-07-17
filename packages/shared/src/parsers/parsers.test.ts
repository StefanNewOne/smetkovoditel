import { describe, expect, it } from "vitest";
import { parseNlbStatement } from "./nlb";
import { parseMetaReceipt } from "./meta";

// Synthetic fixtures reproducing the real NLB/Meta text layout (garbled Cyrillic replaced with
// ASCII placeholders — the parser ignores names). The real statements 146/149 + 3 Meta receipts
// are verified separately by a local golden test (gitignored; public repo must not hold real
// financial data). Format validated against those real documents.

const NLB_OK = `
 01.01.2026
HEADER LABELS
1.000,00500,00300,00800,0011
row labels
1
IME NA PRIMAC
NLB Banka500,00220
MBDP:8234:AAAAAA Dublin           FACEBK
*TESTCODE01
87BXS11111111
210-0466453101-19
10012500
2
DRUG PRIMAC
TTK Banka300,00220
plakjanje po usluga
290-0000000000-00
1-5/2026
Vkupno denari500,00300,00
Broj na izvod999
ZA PROMENI NA SOSTOJBATA
210-0768360001-38
Naziv na imatel
Danochen4032023558371
Vkupno za smetkata210-0768360001-38ima2nalozi
Stranica1 / 1
`;

// Same layout but the credit total (400,00 / new 900,00) does not match the single IN line.
const NLB_TAMPERED = NLB_OK.replace("1.000,00500,00300,00800,0011", "1.000,00500,00400,00900,0011");

const META_OK = `
Receipt for Тест Клиент
Account ID: 123456789012345
Invoice/Payment Date
Jan 1, 2026, 1:00 PM
Payment method
MasterCard ···· 8234
Reference Number: TESTCODE01
Transaction ID
111-222
Product Type
Meta ads
Paid
$10.00
$10.00
Meta Platforms Ireland Limited
Dublin 4
Ireland
Invoice # FBADS-1-2
`;

const META_PARTIAL = META_OK.replace("Reference Number: TESTCODE01", "");

describe("NLB statement parser", () => {
  const s = parseNlbStatement(NLB_OK);

  it("reads header, statement number and order count", () => {
    expect(s.statementNumber).toBe(999);
    expect(s.orderCount).toBe(2);
    expect(s.prevBalance).toBe(100000);
    expect(s.totalDebit).toBe(50000);
    expect(s.totalCredit).toBe(30000);
    expect(s.newBalance).toBe(80000);
  });

  it("parses + classifies both lines with derived direction (§4.2)", () => {
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]).toMatchObject({
      classifiedAs: "META_ADS",
      facebkCode: "TESTCODE01",
      amount: 50000,
      direction: "OUT",
    });
    expect(s.lines[1]).toMatchObject({
      classifiedAs: "CLIENT_PAYMENT",
      reference: "1-5/2026",
      amount: 30000,
      direction: "IN",
    });
  });

  it("passes the integrity gate when sums self-validate (B14)", () => {
    expect(s.integrity.ok).toBe(true);
    expect(s.parseStatus).toBe("OK");
  });

  it("FAILS integrity when a total does not match (B14 → post nothing)", () => {
    const bad = parseNlbStatement(NLB_TAMPERED);
    expect(bad.integrity.ok).toBe(false);
    expect(bad.integrity.creditOk).toBe(false);
    expect(bad.parseStatus).toBe("FAILED");
  });

  it("produces a stable lineHash for dedupe (B13)", () => {
    const again = parseNlbStatement(NLB_OK);
    expect(again.lines[0]!.lineHash).toBe(s.lines[0]!.lineHash);
  });
});

describe("Meta receipt parser", () => {
  it("extracts all fields incl. Cyrillic account name (§4.3, T8)", () => {
    const m = parseMetaReceipt(META_OK);
    expect(m).toMatchObject({
      accountName: "Тест Клиент",
      metaAccountId: "123456789012345",
      referenceNumber: "TESTCODE01",
      transactionId: "111-222",
      amountUsdCents: 1000,
      metaInvoiceNo: "FBADS-1-2",
      cardLast4: "8234",
      reverseChargeVat: true,
      parseStatus: "OK",
    });
  });

  it("marks incomplete receipts PARTIAL (manual queue)", () => {
    expect(parseMetaReceipt(META_PARTIAL).parseStatus).toBe("PARTIAL");
  });
});
