/**
 * Nautical-mile display helpers shared by the shift card, Review and Logbook.
 */

/** The entry's distance as a number, or 0 when it has none. */
export function entryNm(distanceNm: number | string | null | undefined): number {
  const nm = Number(distanceNm);
  return Number.isFinite(nm) && nm > 0 ? nm : 0;
}

/** Nautical miles for display: one decimal under 100, whole miles from 100, e.g. "44.6 nm", "132 nm". */
export function formatNm(nm: number): string {
  return `${nm >= 100 ? Math.round(nm) : Math.round(nm * 10) / 10} nm`;
}

/**
 * Total miles over confirmed entries that started in the same calendar month as
 * `now` (device local time).
 */
export function monthDistanceNm(
  entries: Array<{ start_time: string; status: string; distance_nm?: number | string | null }>,
  now: Date = new Date(),
): number {
  let total = 0;
  for (const e of entries) {
    if (e.status !== 'confirmed') continue;
    const start = new Date(e.start_time);
    if (start.getFullYear() !== now.getFullYear() || start.getMonth() !== now.getMonth()) continue;
    total += entryNm(e.distance_nm);
  }
  return Math.round(total * 100) / 100;
}
