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
 * Microstates: Monaco, San Marino and the Vatican have open borders with France
 * or Italy and can only be reached through the Schengen area, so days there
 * count. Andorra is outside the area, but there is no Andorran entry stamp and
 * most guidance says days there keep running, so the app counts it too and
 * says so. Counting more days is the safe side for an overstay warning.
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

/** Not members, but days there count (see the header note). */
export const SCHENGEN_COUNTED_MICROSTATES = ['MC', 'SM', 'VA', 'AD'];

const COUNTED = new Set([...SCHENGEN_MEMBERS, ...SCHENGEN_COUNTED_MICROSTATES]);

export function isSchengenCountry(code: string | null | undefined): boolean {
  return !!code && COUNTED.has(code.toUpperCase());
}

export const SCHENGEN_LIMIT = 90;
export const SCHENGEN_WINDOW = 180;
/** Days used at which the app starts to warn. */
export const SCHENGEN_WARN_AT = 80;
