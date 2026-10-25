/**
 * Vessel identity over time: a vessel keeps its IMO for life, but a reflag gives it
 * a new MMSI (and usually call sign), and owners rename. Sea service has to be
 * recorded under the name and flag in force at the time, so changes are kept as a
 * dated history and reports rebuild the identity for each day.
 *
 * Pure functions only (no database).
 */

export const IDENTITY_FIELDS = ['mmsi', 'vessel_name', 'flag', 'callsign'] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export interface IdentityChange {
  field: string;
  old_value: string | null;
  new_value: string | null;
  effective_date: string | Date; // first day the new value applies (YYYY-MM-DD)
  created_at?: Date | string | null;
}

export type Identity = { [K in IdentityField]: string | null };

// Prefixes owners and AIS add or drop freely: "SY Lionheart", "M/Y LIONHEART", "MV ...".
const NAME_PREFIX = /^(M\/?Y|S\/?Y|M\/?V|M\/?S|S\/?V|R\/?V|MT|MFV|FV|HMS|RMS)\s+/;

/** Name in a form that ignores case, punctuation and type prefixes. */
export function normaliseName(name: string | null | undefined): string {
  if (!name) return '';
  let n = name.toUpperCase().replace(/[^A-Z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  n = n.replace(NAME_PREFIX, '');
  return n.replace(/[^A-Z0-9]/g, '');
}

export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  return normaliseName(a) === normaliseName(b);
}

/** Flag / call sign / MMSI compare ignoring case, spaces and punctuation. */
export function sameCode(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (v: string | null | undefined) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n(a) === n(b);
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** AIS reports flags as ISO codes ("CK"); records and reports use the country name. */
export function flagName(flag: string | null | undefined): string | null {
  if (!flag) return null;
  const f = flag.trim();
  if (/^[A-Za-z]{2}$/.test(f)) {
    try {
      const name = regionNames.of(f.toUpperCase());
      if (name && name.toUpperCase() !== f.toUpperCase()) return name;
    } catch {
      // not a region code: keep as given
    }
  }
  return f;
}

const day = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

function newestFirst(changes: IdentityChange[]): IdentityChange[] {
  return [...changes].sort((a, b) => {
    const byDay = day(b.effective_date).localeCompare(day(a.effective_date));
    if (byDay !== 0) return byDay;
    return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
  });
}

/**
 * The identity in force on `on` (YYYY-MM-DD): start from the vessel's current
 * values and undo every change that took effect after that day.
 */
export function identityAsOf<T extends Partial<Identity>>(current: T, changes: IdentityChange[], on: string | Date): T {
  const target = day(on);
  const out: any = { ...current };
  for (const c of newestFirst(changes)) {
    if (!(IDENTITY_FIELDS as readonly string[]).includes(c.field)) continue;
    if (day(c.effective_date) > target) out[c.field] = c.old_value;
  }
  return out;
}

/** First day of each identity period after the first (the dates where reports split). */
export function changeDays(changes: IdentityChange[]): string[] {
  return [...new Set(changes.filter((c) => (IDENTITY_FIELDS as readonly string[]).includes(c.field)).map((c) => day(c.effective_date)))].sort();
}

/** Key for the identity period a day falls in, so entries can be grouped by it. */
export function periodKey(changes: IdentityChange[], on: string | Date): string {
  const target = day(on);
  const days = changeDays(changes).filter((d) => d <= target);
  return days[days.length - 1] ?? 'start';
}
