/**
 * Independent reference implementation of the Schengen short-stay rule.
 *
 * Written straight from Regulation (EU) 2016/399 (Schengen Borders Code),
 * consolidated text 10.7.2024, Article 6:
 *
 *  6(1)  "stays ... of no more than 90 days in any 180-day period, which
 *         entails considering the 180-day period preceding each day of stay"
 *  6(2)  "the date of entry shall be considered as the first day of stay ...
 *         and the date of exit shall be considered as the last day of stay";
 *         "Periods of stay authorised under a residence permit or a long-stay
 *         visa shall not be taken into account".
 *  6(1a) one single period for all Member States operating the EES.
 *
 * Deliberately written without reading backend/src/utils/presence/*. It is the
 * oracle for tests/schengen-oracle.test.ts and must stay independent: keep it
 * simple, brute force, day by day, no shortcuts.
 *
 * Day model: a calendar date is an integer (days since 1970-01-01, UTC).
 * The 180-day period for day D is D-179 .. D inclusive (D itself is the
 * 180th day). A day counts once however many stays (or countries) cover it.
 */

export const LIMIT = 90;
export const WINDOW = 180;

export type RefStay = {
  /** first day in the Schengen area (inclusive) */
  entry: number;
  /** last day in the Schengen area (inclusive); null = still there (open) */
  exit: number | null;
  /** stay covered by a residence permit / long-stay visa: never counted */
  exempt?: boolean;
};

const MS_PER_DAY = 86_400_000;

export function dayNum(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function isoOf(n: number): string {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * The set of counted days. An open stay runs to `openUntil` (normally today,
 * or the end of the planning horizon when the caller wants to assume the
 * person simply stays on).
 */
export function countedDays(stays: RefStay[], openUntil: number): Set<number> {
  const days = new Set<number>();
  for (const s of stays) {
    if (s.exempt) continue;
    const end = s.exit ?? openUntil;
    for (let d = s.entry; d <= end; d++) days.add(d);
  }
  // A day spent under a residence permit is not counted even if another
  // (overlapping) record says ordinary short stay: art. 6(2) excludes the
  // period of stay authorised under the permit, not just that record.
  for (const s of stays) {
    if (!s.exempt) continue;
    const end = s.exit ?? openUntil;
    for (let d = s.entry; d <= end; d++) days.delete(d);
  }
  return days;
}

/** Days of stay in the 180-day period ending on (and including) `on`. */
export function daysUsed(days: Set<number>, on: number): number {
  let n = 0;
  for (let d = on - WINDOW + 1; d <= on; d++) if (days.has(d)) n++;
  return n;
}

/** 90 minus days used on `on`, floored at 0. */
export function daysRemaining(days: Set<number>, on: number): number {
  return Math.max(0, LIMIT - daysUsed(days, on));
}

/** Every day of stay on which the 180-day count exceeds 90. */
export function overstayDays(days: Set<number>): number[] {
  const out: number[] = [];
  for (const d of [...days].sort((a, b) => a - b)) {
    if (daysUsed(days, d) > LIMIT) out.push(d);
  }
  return out;
}

/**
 * If the person is (or will be) in the area continuously from `from`
 * onwards, the first day on which the count goes over 90, and so the last
 * lawful day (that day minus one). `from` itself is assumed to be a day of
 * stay. Returns null if the count is already over on `from` (lastLegal) in
 * which case firstOver = from.
 */
export function continuousStayLimit(
  days: Set<number>,
  from: number,
): { lastLegal: number | null; firstOver: number } {
  const sim = new Set(days);
  for (let d = from; d < from + 10 * WINDOW; d++) {
    sim.add(d);
    if (daysUsed(sim, d) > LIMIT) {
      return { lastLegal: d === from ? null : d - 1, firstOver: d };
    }
  }
  throw new Error('no limit found within horizon');
}

/**
 * Trip tester: would a planned stay [start, end] be within the rule?
 * Checks every day of the planned trip, with the trip added to the days
 * already logged. (Whether the trip pushes a later logged stay over is
 * checked separately in the test, because that is a property of the plan
 * as a whole rather than of the trip's own days.)
 */
export function tripVerdict(
  days: Set<number>,
  start: number,
  end: number,
): { ok: boolean; firstOver: number | null; maxUsed: number } {
  const sim = new Set(days);
  for (let d = start; d <= end; d++) sim.add(d);
  let firstOver: number | null = null;
  let maxUsed = 0;
  for (let d = start; d <= end; d++) {
    const u = daysUsed(sim, d);
    if (u > maxUsed) maxUsed = u;
    if (u > LIMIT && firstOver === null) firstOver = d;
  }
  return { ok: firstOver === null, firstOver, maxUsed };
}
