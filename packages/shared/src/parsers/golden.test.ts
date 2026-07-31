import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseNlbStatement } from "./nlb";
import { parseMetaReceipt } from "./meta";

/**
 * Committed golden-file regression (CLAUDE.md Cat 6). The REAL statements 146/149 + 3 Meta
 * receipts hold live financial data and stay gitignored (`_fixtures/`, verified by the local
 * `_fixtures/golden.ts` script). These committed fixtures are REDACTED copies — names, accounts
 * and amounts altered, but the exact byte layout the parsers depend on (column runs, шифра,
 * FACEBK codes, повикување на број, own-account footer) preserved 1:1. A format regression fails
 * here before it can reach develop, without ever committing real data.
 *
 * Structure mirrors the real docs: 146 = 1 META_ADS (OUT) + 1 CLIENT_PAYMENT (IN); 149 = 5
 * META_ADS + 2 CARD_TX, all OUT (побарува 0). meta-1's referenceNumber matches 149's first
 * FACEBK line so the USD→MKD rate-sanity path (§4.4) is exercised too.
 */
const read = (f: string) => readFileSync(new URL(`./__fixtures__/${f}`, import.meta.url), "utf8");

describe("golden: NLB statement 146 (redacted)", () => {
  const s = parseNlbStatement(read("nlb-146.txt"));

  it("reads header + statement number + order count", () => {
    expect(s.statementNumber).toBe(146);
    expect(s.orderCount).toBe(2);
    expect(s.prevBalance).toBe(10000000);
    expect(s.totalDebit).toBe(90000);
    expect(s.totalCredit).toBe(2000000);
    expect(s.newBalance).toBe(11910000);
  });

  it("passes the integrity gate (B14)", () => {
    expect(s.integrity.ok).toBe(true);
    expect(s.parseStatus).toBe("OK");
  });

  it("classifies the META_ADS OUT and CLIENT_PAYMENT IN lines (§4.2)", () => {
    expect(s.lines).toHaveLength(2);
    expect(s.lines[0]).toMatchObject({
      classifiedAs: "META_ADS",
      facebkCode: "RD01ADSXX1",
      amount: 90000,
      direction: "OUT",
    });
    expect(s.lines[1]).toMatchObject({
      classifiedAs: "CLIENT_PAYMENT",
      reference: "1-70/2026",
      amount: 2000000,
      direction: "IN",
    });
  });

  it("produces a stable lineHash for dedupe (B13)", () => {
    const again = parseNlbStatement(read("nlb-146.txt"));
    expect(again.lines[0]!.lineHash).toBe(s.lines[0]!.lineHash);
    expect(again.lines[1]!.lineHash).toBe(s.lines[1]!.lineHash);
  });
});

describe("golden: NLB statement 149 (redacted, 7 lines)", () => {
  const s = parseNlbStatement(read("nlb-149.txt"));

  it("reads 7 orders, all OUT, credit 0 (T4 shape)", () => {
    expect(s.statementNumber).toBe(149);
    expect(s.orderCount).toBe(7);
    expect(s.lines).toHaveLength(7);
    expect(s.totalCredit).toBe(0);
    expect(s.lines.every((l) => l.direction === "OUT")).toBe(true);
  });

  it("classifies 5 META_ADS + 2 CARD_TX (priority pipeline §4.2)", () => {
    expect(s.lines.filter((l) => l.classifiedAs === "META_ADS")).toHaveLength(5);
    const cards = s.lines.filter((l) => l.classifiedAs === "CARD_TX");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ cardLast4: "5678", merchant: "MAKPETROL SKOPJE" });
    expect(cards[1]).toMatchObject({ cardLast4: "6789", merchant: "LUKOIL SKOPJE" });
  });

  it("passes the integrity gate (30.000 − 12.000 + 0 = 18.000, 7 == 7)", () => {
    expect(s.integrity.ok).toBe(true);
    expect(s.totalDebit).toBe(1200000);
    expect(s.newBalance).toBe(1800000);
  });
});

describe("golden: Meta receipts (redacted)", () => {
  it("parses meta-1 fully (OK)", () => {
    const m = parseMetaReceipt(read("meta-1.txt"));
    expect(m).toMatchObject({
      referenceNumber: "AAAA111111",
      amountUsdCents: 1800,
      metaInvoiceNo: "FBADS-9-1",
      cardLast4: "5001",
      reverseChargeVat: true,
      parseStatus: "OK",
    });
  });

  it("parses the Cyrillic account name on meta-2 (§4.3, T8 shape)", () => {
    const m = parseMetaReceipt(read("meta-2.txt"));
    expect(m.accountName).toBe("Тест Клиент Кирилица");
    expect(m.referenceNumber).toBe("BBBB222222");
    expect(m.amountUsdCents).toBe(3600);
  });

  it("parses meta-3 reference + amount", () => {
    const m = parseMetaReceipt(read("meta-3.txt"));
    expect(m.referenceNumber).toBe("CCCC333333");
    expect(m.amountUsdCents).toBe(5400);
  });
});

describe("golden: USD→MKD rate sanity (§4.4, T6 shape)", () => {
  it("statement↔receipt rate is in the НБРМ band and books the MKD 1:1", () => {
    const s149 = parseNlbStatement(read("nlb-149.txt"));
    const m1 = parseMetaReceipt(read("meta-1.txt"));
    const line = s149.lines.find((l) => l.facebkCode === m1.referenceNumber);
    expect(line).toBeDefined();
    // Booked/re-billed amount is ALWAYS the MKD from the statement, never the USD (D3).
    expect(line!.amount).toBe(100000); // 1.000,00 ден
    const rate = line!.amount / m1.amountUsdCents!; // 100000 / 1800
    expect(rate).toBeGreaterThan(50);
    expect(rate).toBeLessThan(58);
  });
});
