import { beforeEach, describe, expect, it } from "vitest";
import { parseNbrmUsdMid, updateExchangeRate } from "@/lib/workflows/w7";
import { prisma, resetDb } from "./setup/db";

/**
 * W7 — НБРМ USD mid-rate (§W7, SM-37). The rate is USD-only sanity data (D3), never money. Tests
 * inject a fake fetcher — no live network. Covers the XML parse, the daily upsert, and the
 * fallback-to-last-rate + staleness path when the feed is unavailable.
 */
const NBRM_XML = `<?xml version="1.0" encoding="utf-8"?>
<KursZbir>
  <Kurs><Reden_broj>1</Reden_broj><Oznaka>EUR</Oznaka><Nomin>1</Nomin><Kupoven>61,3000</Kupoven><Sreden>61,4500</Sreden><Prodazen>61,6000</Prodazen></Kurs>
  <Kurs><Reden_broj>2</Reden_broj><Oznaka>USD</Oznaka><Nomin>1</Nomin><Kupoven>56,5000</Kupoven><Sreden>56,7788</Sreden><Prodazen>57,0000</Prodazen></Kurs>
</KursZbir>`;

const OK_URL = "https://nbrm.test/rates";
const okFetcher = async () => NBRM_XML;
const failFetcher = async () => {
  throw new Error("network down");
};

beforeEach(async () => {
  await resetDb();
});

describe("W7 — parseNbrmUsdMid", () => {
  it("extracts the USD mid rate (MK decimal comma → dot), ignoring EUR", () => {
    expect(parseNbrmUsdMid(NBRM_XML)).toBeCloseTo(56.7788, 4);
  });

  it("respects <Nomin> denomination", () => {
    const xml = NBRM_XML.replace(
      "<Oznaka>USD</Oznaka><Nomin>1</Nomin>",
      "<Oznaka>USD</Oznaka><Nomin>100</Nomin>",
    );
    expect(parseNbrmUsdMid(xml)).toBeCloseTo(0.567788, 6);
  });

  it("throws when there is no USD block", () => {
    expect(() => parseNbrmUsdMid("<KursZbir></KursZbir>")).toThrow();
  });
});

describe("W7 — updateExchangeRate", () => {
  it("fetches and upserts today's USD rate (source = nbrm)", async () => {
    const now = new Date(Date.UTC(2026, 6, 17));
    const res = await updateExchangeRate({ fetcher: okFetcher, url: OK_URL, now });
    expect(res).toMatchObject({ source: "nbrm", stale: false, date: "2026-07-17" });
    expect(res.midMkd).toBeCloseTo(56.7788, 4);

    const row = await prisma.exchangeRate.findFirstOrThrow({ where: { code: "USD" } });
    expect(row.midMkd).toBeCloseTo(56.7788, 4);
  });

  it("upsert is idempotent for the same day (one row per date)", async () => {
    const now = new Date(Date.UTC(2026, 6, 17));
    await updateExchangeRate({ fetcher: okFetcher, url: OK_URL, now });
    await updateExchangeRate({ fetcher: okFetcher, url: OK_URL, now });
    expect(await prisma.exchangeRate.count()).toBe(1);
  });

  it("falls back to the last stored rate and flags stale when the feed fails", async () => {
    // Seed a rate 10 days old.
    await prisma.exchangeRate.create({
      data: { date: new Date(Date.UTC(2026, 6, 7)), code: "USD", midMkd: 55.5 },
    });
    const now = new Date(Date.UTC(2026, 6, 17));
    const res = await updateExchangeRate({ fetcher: failFetcher, url: OK_URL, now });
    expect(res).toMatchObject({ source: "fallback", stale: true, date: "2026-07-07" });
    expect(res.midMkd).toBe(55.5);
  });

  it("fallback within STALE_DAYS is not flagged stale", async () => {
    await prisma.exchangeRate.create({
      data: { date: new Date(Date.UTC(2026, 6, 15)), code: "USD", midMkd: 56.1 },
    });
    const now = new Date(Date.UTC(2026, 6, 17)); // 2 days → within 3
    const res = await updateExchangeRate({ fetcher: failFetcher, url: OK_URL, now });
    expect(res).toMatchObject({ source: "fallback", stale: false });
  });

  it("throws when there is no live rate and nothing to fall back to", async () => {
    await expect(
      updateExchangeRate({ fetcher: failFetcher, url: OK_URL, now: new Date() }),
    ).rejects.toThrow();
  });
});
