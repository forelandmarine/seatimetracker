/**
 * Schengen 90/180 short-stay rule (2.5.0 "Days abroad").
 *
 * Rule: no more than 90 days in any 180-day period. For each day, count back
 * 180 days (that day and the 179 before it); the days spent in the Schengen
 * area in that window must not pass 90. The day of entry is the first day of
 * stay and the day of exit is the last, so both count. Stays on a residence
 * permit or long-stay visa do not count; the app leaves those to the user.
 * Source: Regulation (EU) 2016/399 (Schengen Borders Code) art. 6(1) and 6(2),
 * https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02016R0399-20240710
 * and the Commission's short-stay calculator page,
 * https://home-affairs.ec.europa.eu/policies/schengen/border-crossing/short-stay-calculator_en
 *
 * Membership (checked 2026-11-10 at
 * https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en):
 * 29 countries, 25 EU states plus Iceland, Norway, Switzerland and Liechtenstein.
 * Bulgaria and Romania became full members on 1 January 2025 (land borders
 * included). Cyprus is not yet a full member (internal border checks remain)
 * and Ireland has an opt-out, so neither counts.
 *
 * Joining dates (checked 2026-11-22): Croatia counts from 1 January 2023
 * (Council Decision (EU) 2022/2451), Bulgaria and Romania from 31 March 2024,
 * when checks at internal air and sea borders were lifted (Council Decision
 * (EU) 2024/210; land borders followed on 1 January 2025, Decision (EU)
 * 2024/3212). Before those dates days there were counted separately, so the
 * app leaves them out of the Schengen count.
 *
 * Gibraltar is not in the Schengen area, but under the UK-EU agreement on
 * Gibraltar, applied provisionally from 15 July 2026, any time there counts
 * with Schengen time towards the 90 days. Sources (read 2026-11-22):
 * GOV.UK Gibraltar entry requirements,
 * https://www.gov.uk/foreign-travel-advice/gibraltar/entry-requirements ,
 * and HM Government of Gibraltar technical notice on immigration at Gibraltar
 * airport and the crossing of Schengen external borders (press release
 * 562/2026),
 * https://www.gibraltar.gov.gi/press-releases/technical-notice-reminder-concerning-immigration-arrangements-at-gibraltar-airport-and-the-crossing-of-schengen-external-borders-5622026-12205 .
 * Days in Gibraltar from 15 July 2026 count; earlier days do not. Gibraltar
 * residents are exempt from the Entry/Exit System under the treaty, but the
 * app cannot tell who is a resident and still counts their days (the cautious
 * side: a resident who does not need the count can ignore it).
 *
 * Microstates: Monaco, San Marino and the Vatican have open borders with France
 * or Italy and can only be reached through the Schengen area, so days there
 * count. Andorra is outside the area and checks its borders, but no exit from
 * the Schengen area is recorded when you go there, so in practice the days keep
 * running (the Commission's note on the draft EU-Andorra agreement, Council doc
 * ST 12881/26, says Andorran residents would otherwise be registered as
 * overstayers by the Entry/Exit System). That agreement (COM(2026) 445, art. 15)
 * would make days in Andorra count by law; it was not yet in force when checked
 * on 2026-11-22. The app counts Andorra and says so. Counting more days is the
 * safe side for an overstay warning.
 *
 * Caution policy (owner's rule, 2026-11-22: err on the side of caution with
 * any unknown or ambiguous day count). Where a day is unknown the app counts
 * it: microstates and Gibraltar as above; on-board days in a Schengen port
 * (switch on by default); days at sea after a Schengen port (unless switched
 * off: cleared out with an exit check); unlogged days between two stays that
 * count. See schengenDayDetail in presence.ts and the research doc.
 *
 * Outermost regions: the Canary Islands (ES), Azores and Madeira (PT) are in
 * the area and use their country's code. French territories outside Europe
 * (Guadeloupe, Martinique, French Guiana, Reunion, Mayotte, Saint-Martin,
 * Saint-Barthelemy and the overseas collectivities) are not in the area
 * (https://france-visas.gouv.fr/en/web/france-visas/france-in-the-schengen-area);
 * they have their own ISO codes, so they do not count. Svalbard (SJ), the Faroe
 * Islands (FO) and Greenland (GL) are outside too.
 */

export const SCHENGEN_MEMBERS = [
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'NO', 'CH', 'LI',
];

/**
 * Not members, but days there count (see the header note). Gibraltar is not a
 * microstate; it sits in this list so the app shows the on-board toggle for it.
 */
export const SCHENGEN_COUNTED_MICROSTATES = ['MC', 'SM', 'VA', 'AD', 'GI'];

/** Countries whose days only count from a date (YYYY-MM-DD, inclusive). */
export const SCHENGEN_COUNTS_FROM: Record<string, string> = {
  HR: '2023-01-01',
  BG: '2024-03-31',
  RO: '2024-03-31',
  GI: '2026-07-15', // UK-EU agreement on Gibraltar, provisional application (see the header)
};

const COUNTED = new Set([...SCHENGEN_MEMBERS, ...SCHENGEN_COUNTED_MICROSTATES]);

/** True when days in the country count for Schengen now (or on `onDate`, YYYY-MM-DD, when given). */
export function isSchengenCountry(code: string | null | undefined, onDate?: string): boolean {
  if (!code) return false;
  const c = code.toUpperCase();
  if (!COUNTED.has(c)) return false;
  const from = SCHENGEN_COUNTS_FROM[c];
  return !onDate || !from || onDate >= from;
}

export const SCHENGEN_LIMIT = 90;
export const SCHENGEN_WINDOW = 180;
/** Days used at which the app starts to warn. */
export const SCHENGEN_WARN_AT = 80;
