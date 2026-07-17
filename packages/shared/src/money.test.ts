import { describe, expect, it } from "vitest";
import { formatMKD, parseDenari, vatOf, withVat } from "./money";

describe("money (integer дени)", () => {
  it("parses де-DE денари strings to дени", () => {
    expect(parseDenari("5.782,00")).toBe(578200); // Master Plan §4.2 example
    expect(parseDenari("30.000")).toBe(3000000); // 30 000 денари
    expect(parseDenari("865,00")).toBe(86500); // T1: Expense ADS 86.500 дени
    expect(parseDenari("21.594,00 ден")).toBe(2159400); // T5
  });

  it("formats дени back to де-DE денари", () => {
    expect(formatMKD(578200)).toBe("5.782,00");
    expect(formatMKD(3000000, { decimals: 0 })).toBe("30.000");
    expect(formatMKD(86500, { withSuffix: true })).toBe("865,00 ден");
  });

  it("computes 18% ДДВ (T9: 30.000 base → 5.400 VAT → 35.400 total)", () => {
    const base = 3000000; // 30.000 денари
    expect(vatOf(base)).toBe(540000); // 5.400 денари
    expect(withVat(base)).toBe(3540000); // 35.400 денари
  });

  it("round-trips parse → format", () => {
    expect(formatMKD(parseDenari("1.284.400,00"))).toBe("1.284.400,00");
  });
});
