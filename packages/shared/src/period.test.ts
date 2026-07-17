import { describe, expect, it } from "vitest";
import { currentPeriod, invoiceNumber, periodStart, shiftPeriod } from "./period";

describe("period + invoice numbering", () => {
  it("formats invoice number 1-{n}/{M}-{YYYY} (T9: 1-{n}/7-2026)", () => {
    expect(invoiceNumber(66, "2026-07")).toBe("1-66/7-2026");
    expect(invoiceNumber(1, "2026-12")).toBe("1-1/12-2026");
  });

  it("shifts periods across year boundaries", () => {
    expect(shiftPeriod("2026-07", 1)).toBe("2026-08");
    expect(shiftPeriod("2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
  });

  it("computes period start as the 1st (UTC)", () => {
    expect(periodStart("2026-07").toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("derives the current period from a date", () => {
    expect(currentPeriod(new Date("2026-07-17T10:00:00Z"))).toBe("2026-07");
  });
});
