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

// ── From a crew member's log to days of stay ──────────────────────────
//
// The owner's caution rules (2026-11-22), written from the brief, not from
// the app code:
//
//  (a) "At sea" after a Schengen port. A yacht sailing between Schengen ports
//      is never checked out of the area (Borders Code art. 6; Annex VI
//      3.2.4 to 3.2.6), and the app cannot know whether an exit check was
//      done before an ocean passage. So a log entry at sea counts when the
//      entry immediately before it in time counts and no unlogged day lies
//      between the earlier entries and the passage, unless the crew member
//      marked it "cleared out with an exit check". It counts only from the
//      day the place it sailed from counts (Gibraltar from 15 July 2026, late
//      joiners).
//  (b) Unknown days (owner's rule, 2026-11-23). A day with nothing logged is
//      time outside the area and never counts.
//
// "Immediately before in time": entries are ranked by first day, then last
// day, then the order they were written down; the one ranked just below.

export type RefLogEntry = {
  first: number;
  /** null = open, runs to today (or is a one-day entry when it starts later) */
  last: number | null;
  place: "area" | "outside" | "sea";
  /** "area" only: the first day the place counts (Gibraltar, late joiners) */
  countsFrom?: number;
  /** "sea" only: crew member says they cleared out with an exit check */
  clearedOut?: boolean;
};

function rankBelow(a: [number, number, number], b: [number, number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
}

/** Counted days of stay from a log, by brute force, one day at a time. */
export function daysFromLog(log: RefLogEntry[], today: number): Set<number> {
  const lastOf = (e: RefLogEntry) => e.last ?? Math.max(today, e.first);
  const key = (i: number): [number, number, number] => [log[i].first, lastOf(log[i]), i];

  // From which day each entry counts (Infinity = never).
  const memo = new Map<number, number>();
  const countsFrom = (i: number): number => {
    if (memo.has(i)) return memo.get(i)!;
    const e = log[i];
    let v = Infinity;
    if (e.place === "area") v = e.countsFrom ?? -Infinity;
    else if (e.place === "sea" && !e.clearedOut) {
      let before = -1;
      for (let j = 0; j < log.length; j++) {
        if (j === i || !rankBelow(key(j), key(i))) continue;
        if (before < 0 || rankBelow(key(before), key(j))) before = j;
      }
      // Joined: some earlier-ranked entry reaches the day before the passage.
      let reach = -Infinity;
      for (let j = 0; j < log.length; j++) if (j !== i && rankBelow(key(j), key(i))) reach = Math.max(reach, lastOf(log[j]));
      if (before >= 0 && reach >= e.first - 1) v = countsFrom(before);
    }
    memo.set(i, v);
    return v;
  };

  const days = new Set<number>();
  if (log.length === 0) return days;
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of log) {
    lo = Math.min(lo, e.first);
    hi = Math.max(hi, lastOf(e));
  }
  for (let d = lo; d <= hi; d++) {
    const covering = log.map((_, i) => i).filter((i) => log[i].first <= d && d <= lastOf(log[i]));
    if (covering.length) {
      if (covering.some((i) => d >= countsFrom(i))) days.add(d);
      continue;
    }
    // Unlogged day: outside the area (rule b).
  }
  return days;
}
