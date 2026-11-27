/** Calendar-date helpers on 'YYYY-MM-DD' strings, in UTC, so results never depend on server time zone. */

const RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDate(s: string): Date {
  const m = RE.exec(s);
  if (!m) throw new Error(`Invalid date ${JSON.stringify(s)}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== s) throw new Error(`Invalid date ${JSON.stringify(s)}`);
  return d;
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

/** Adds whole years. Feb 29 maps to Feb 28 in a non-leap year (the earlier, conservative date). */
export function addYears(s: string, years: number): string {
  const d = parseDate(s);
  const y = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  return formatDate(new Date(Date.UTC(y, month, Math.min(d.getUTCDate(), lastDay))));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}
