/**
 * "2026-11-03" as midnight on the phone's own clock. `new Date("2026-11-03")`
 * is UTC midnight, which shows as 2 Nov anywhere west of Greenwich.
 */
export function localDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

/** Whole days from today (local) to a date-only value; negative once it has passed. */
export function daysUntil(value: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((localDate(value).getTime() - today.getTime()) / 86_400_000);
}

/** Today's date as "YYYY-MM-DD" on the phone's clock. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
