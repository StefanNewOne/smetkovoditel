import "server-only";
import { prisma } from "@smetko/db";

/**
 * W7 — daily НБРМ USD mid-rate (Master Plan §W7). USD exists ONLY as the ±6% sanity check on Meta
 * matching (D3) — this rate is never money, never billed. ExchangeRate.midMkd is the sole Float in
 * the model (a rate, not денари). On fetch/parse failure we fall back to the last stored rate and
 * warn if it is stale (> STALE_DAYS old); business logic degrades, it never books a wrong number.
 */
const STALE_DAYS = 3;

/** Normalize to date-only UTC midnight so there is exactly one rate row per day (@@unique). */
function dayUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Parse the НБРМ `za_ozis` XML and return the USD mid rate (MKD per 1 USD). The feed lists one
 * <Kurs> block per currency; we take the USD block's <Sreden> (mid), MK decimal comma → dot,
 * divided by <Nomin> (denomination, usually 1). Throws if the USD block is absent/unparseable.
 */
export function parseNbrmUsdMid(xml: string): number {
  const block = xml.match(
    /<Kurs>(?:(?!<\/Kurs>)[\s\S])*?<Oznaka>\s*USD\s*<\/Oznaka>[\s\S]*?<\/Kurs>/i,
  );
  if (!block) throw new Error("НБРМ: нема USD блок во одговорот.");
  const sreden = block[0].match(/<Sreden>\s*([\d.]+,\d+|\d+)\s*<\/Sreden>/i)?.[1];
  if (!sreden) throw new Error("НБРМ: нема среден курс за USD.");
  const nomin = Number(block[0].match(/<Nomin>\s*(\d+)\s*<\/Nomin>/i)?.[1] ?? "1") || 1;
  const mid = Number(sreden.replace(/\./g, "").replace(",", ".")) / nomin;
  if (!Number.isFinite(mid) || mid <= 0) throw new Error("НБРМ: неважечки USD курс.");
  return mid;
}

export type Fetcher = (url: string) => Promise<string>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`НБРМ HTTP ${res.status}`);
  return res.text();
};

export interface RateResult {
  source: "nbrm" | "fallback";
  midMkd: number;
  date: string; // YYYY-MM-DD of the stored rate
  stale: boolean; // true when a fallback rate is older than STALE_DAYS
}

/**
 * Fetch today's НБРМ USD mid and upsert ExchangeRate(date, "USD"). On any failure fall back to the
 * most recent stored rate; flag `stale` when that rate is > STALE_DAYS old. Throws only when there
 * is neither a live rate nor any stored rate to fall back to.
 */
export async function updateExchangeRate(
  opts: { fetcher?: Fetcher; now?: Date; url?: string } = {},
): Promise<RateResult> {
  const now = opts.now ?? new Date();
  const url = opts.url ?? process.env.NBRM_RATE_URL ?? "";
  const today = dayUTC(now);
  const fetcher = opts.fetcher ?? defaultFetcher;

  try {
    if (!url) throw new Error("NBRM_RATE_URL не е конфигуриран.");
    const xml = await fetcher(url);
    const midMkd = parseNbrmUsdMid(xml);
    await prisma.exchangeRate.upsert({
      where: { date_code: { date: today, code: "USD" } },
      update: { midMkd },
      create: { date: today, code: "USD", midMkd },
    });
    return { source: "nbrm", midMkd, date: today.toISOString().slice(0, 10), stale: false };
  } catch (err) {
    const last = await prisma.exchangeRate.findFirst({
      where: { code: "USD" },
      orderBy: { date: "desc" },
    });
    if (!last) throw err instanceof Error ? err : new Error("W7: нема курс за fallback.");
    const ageDays = Math.floor((today.getTime() - dayUTC(last.date).getTime()) / 86_400_000);
    return {
      source: "fallback",
      midMkd: last.midMkd,
      date: last.date.toISOString().slice(0, 10),
      stale: ageDays > STALE_DAYS,
    };
  }
}
