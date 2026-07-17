/**
 * Money is stored and computed as an INTEGER number of дени (the денар subunit; 1 денар = 100
 * дени), per Master Plan ДЕЛ II ("integer дени"). Float is forbidden for money math (B10).
 * This module is the ONLY place дени are parsed from / formatted to human strings.
 *
 * Examples (from the Master Plan): "5.782,00" ден  → 578200 дени ;  865,00 ден → 86500 дени.
 * Display uses de-DE grouping: 578200 дени → "5.782,00".
 */

/** A branded integer count of дени. Use `deni(n)` to construct from a known-integer value. */
export type Deni = number;

export const DENI_PER_DENAR = 100;

/** Macedonian standard VAT (ДДВ). Never hardcode 0.18 elsewhere — reference this. (B11) */
export const VAT_RATE = 0.18;

/** Assert-construct a Deni from an already-integer value. Throws on non-integers. */
export function deni(value: number): Deni {
  if (!Number.isInteger(value)) {
    throw new Error(`Deni must be an integer number of дени, got ${value}`);
  }
  return value;
}

/**
 * Parse a Macedonian денари string ("5.782,00" or "30.000") into integer дени.
 * Rules: "." = thousands separator, "," = decimal separator (de-DE / mk-MK).
 */
export function parseDenari(input: string): Deni {
  const cleaned = input
    .trim()
    .replace(/[^\d.,-]/g, "") // drop currency words / spaces
    .replace(/\./g, "") // remove thousands separators
    .replace(",", "."); // decimal comma → dot
  if (cleaned === "" || cleaned === "-") {
    throw new Error(`Cannot parse денари from "${input}"`);
  }
  const denari = Number(cleaned);
  if (!Number.isFinite(denari)) {
    throw new Error(`Cannot parse денари from "${input}"`);
  }
  return Math.round(denari * DENI_PER_DENAR);
}

/** Format integer дени as a de-DE денари string, e.g. 578200 → "5.782,00" (2 decimals). */
export function formatMKD(
  value: Deni,
  opts: { decimals?: 0 | 2; withSuffix?: boolean } = {},
): string {
  const { decimals = 2, withSuffix = false } = opts;
  const denari = value / DENI_PER_DENAR;
  const formatted = denari.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return withSuffix ? `${formatted} ден` : formatted;
}

/** VAT (ДДВ) on a base amount in дени. Returns дени, rounded to the nearest ден. */
export function vatOf(base: Deni, rate: number = VAT_RATE): Deni {
  return Math.round(base * rate);
}

/** base + VAT, in дени. */
export function withVat(base: Deni, rate: number = VAT_RATE): Deni {
  return base + vatOf(base, rate);
}
