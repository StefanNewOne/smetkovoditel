/** Period helpers. A period is the string "YYYY-MM" (Master Plan). Pure — usable in web + worker. */

export function currentPeriod(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function periodStart(period: string): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1));
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Invoice number `1-{n}/{M}-{YYYY}` (Master Plan §6). M has no leading zero. */
export function invoiceNumber(seq: number, period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `1-${seq}/${m}-${y}`;
}

export function isValidPeriod(period: string): boolean {
  return /^\d{4}-\d{2}$/.test(period);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
