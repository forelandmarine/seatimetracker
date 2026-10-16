/**
 * Sea-day totals shown in the app, taken from GET /api/reports/summary so the
 * logbook and vessel screens show the same figure as the submitted report.
 *
 * Adding up each entry's own `sea_days` double counts dates where entries
 * overlap (common with AIS detections) and ignores the 90-day yard cap and the
 * port exclusion. The summary endpoint applies all of those.
 */

export interface ReportSummaryTotals {
  total_days: number;
  uscg_service?: { creditable: number } | null;
  amsa_service?: { underway: number; not_underway: number } | null;
  mnz_service?: { qualifying_total: number } | null;
  entries_by_vessel?: { vessel_name: string; total_days: number }[];
}

/** The headline sea-day total for the user's chosen authority. */
export function headlineSeaDays(
  summary: ReportSummaryTotals | null | undefined,
  authority: string | null | undefined
): number | null {
  if (!summary) return null;
  switch (authority) {
    case 'uscg':
      return summary.uscg_service?.creditable ?? summary.total_days;
    case 'amsa':
      return summary.amsa_service
        ? summary.amsa_service.underway + summary.amsa_service.not_underway
        : summary.total_days;
    case 'mnz':
      return summary.mnz_service?.qualifying_total ?? summary.total_days;
    default:
      return summary.total_days;
  }
}

/** Distinct sea days for one vessel, matched by name as the summary groups them. */
export function vesselSeaDays(
  summary: ReportSummaryTotals | null | undefined,
  vesselName: string | null | undefined
): number | null {
  if (!summary?.entries_by_vessel) return null;
  const name = vesselName || 'Unknown';
  return summary.entries_by_vessel.find((v) => v.vessel_name === name)?.total_days ?? 0;
}

const toLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** A 4-hour date counts as a sea day under MCA and MNZ rules. */
const MIN_HOURS_ON_DATE = 4;

interface CalendarEntry {
  start_time: string;
  end_time?: string | null;
  sea_days?: number | null;
}

/**
 * The local calendar dates an entry earns sea days on, for the logbook calendar.
 *
 * An entry with no end time is a single declared day on its start date. Longer
 * entries mark each date they cover for at least 4 hours. If an entry earns
 * days but no single date reaches 4 hours (a short passage across midnight
 * under an 8-hour-per-24-hours rule), the date with the most time is marked.
 */
export function creditedDates(entry: CalendarEntry): string[] {
  if (!entry.sea_days || entry.sea_days <= 0) return [];

  const start = new Date(entry.start_time);
  if (!entry.end_time) return [toLocalDateString(start)];

  const end = new Date(entry.end_time);
  if (!(end > start)) return [toLocalDateString(start)];

  const hoursByDate: { date: string; hours: number }[] = [];
  let cursor = start;
  while (cursor < end) {
    const nextMidnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const sliceEnd = nextMidnight < end ? nextMidnight : end;
    hoursByDate.push({
      date: toLocalDateString(cursor),
      hours: (sliceEnd.getTime() - cursor.getTime()) / 3_600_000,
    });
    cursor = sliceEnd;
  }

  const dates = hoursByDate.filter((d) => d.hours >= MIN_HOURS_ON_DATE).map((d) => d.date);
  if (dates.length > 0) return dates;

  const longest = hoursByDate.reduce((a, b) => (b.hours > a.hours ? b : a));
  return [longest.date];
}

/**
 * Label for an entry worth 0 sea days under an 8-hour authority, so users can
 * see its hours still matter. AMSA adds part days together; USCG treats a 4 to
 * 8 hour day on a small vessel as provisional. Returns null when the normal
 * day label should be used.
 */
export function partDayLabel(
  seaDays: number | null | undefined,
  durationHours: number | string | null | undefined,
  authority: string | null | undefined
): string | null {
  if (seaDays !== 0) return null;
  const hours = Number(durationHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const h = `${hours.toFixed(1)} h`;
  if (authority === 'amsa') return `${h} (part day)`;
  if (authority === 'uscg') return hours >= 4 ? `${h} (provisional)` : `${h} (under 4 h)`;
  return null;
}
