/**
 * Tax day rules per country (2.5.0 "Days abroad").
 *
 * A small table of day-count tests for countries common among crew. Each rule
 * says when the country's tax year starts, how a day is counted, and which test
 * the day count is held against. It is guidance only: every country also has
 * tests that are not about days (a home, family, centre of interests), and
 * treaties can override all of it.
 *
 * Checked on 2026-11-10 against the official pages listed in `sources`. The full
 * notes live in "Tax days and Schengen research 2026-11-10.md" (Store Uploads 2.5.0).
 *
 * Left out on purpose: the Netherlands. Dutch residence is decided on all the
 * circumstances and there is no day-count test for it in Dutch law (the 183-day
 * rule is a treaty rule for where salary is taxed). Its days still get a plain
 * count, like any other country without a rule.
 */

/** How a day in the country is counted. */
export type DayCounting =
  /** In the country at the end of the day (midnight). The day you leave does not count. */
  | 'midnight'
  /** Any part of a day counts, so the days you arrive and leave both count. */
  | 'any_part';

export type TaxTest =
  /** Days in the tax year against a fixed number. `gt` = more than, `gte` = at least. */
  | { type: 'threshold'; days: number; cmp: 'gt' | 'gte' }
  /** More than half the days in the tax year (183 in a normal year, 184 in a leap year). */
  | { type: 'majority' }
  /** US substantial presence test: 31 days this year and 183 weighted days over three years. */
  | { type: 'us_spt' }
  /** Ireland: 183 days this year, or 280 over this year and last (a year with 30 days or fewer is ignored). */
  | { type: 'ie_two_year' }
  /** South Africa physical presence test: more than 91 days this year and in each of the 5 years before, and more than 915 over those 5. */
  | { type: 'za_ppt' }
  /** New Zealand: more than 183 days in any 12-month period. */
  | { type: 'nz_rolling' }
  /** Germany: an unbroken stay of more than six months, which can cross the year end. */
  | { type: 'de_continuous' };

export interface TaxRule {
  country: string; // ISO 3166-1 alpha-2
  /** First day of the tax year, as month (1 to 12) and day. */
  yearStart: { month: number; day: number };
  counting: DayCounting;
  test: TaxTest;
  /** Short plain note for the app (English; the app has its own translated copy keyed by country). */
  note: string;
  sources: string[];
}

export const TAX_RULES: Record<string, TaxRule> = {
  GB: {
    country: 'GB',
    yearStart: { month: 4, day: 6 }, // 6 April to 5 April
    counting: 'midnight',
    // Statutory Residence Test, first automatic UK test: 183 days or more in the tax year.
    // A day counts if you are in the UK at midnight (RFIG20710). Deeming and transit rules are not modelled.
    test: { type: 'threshold', days: 183, cmp: 'gte' },
    note: 'Statutory Residence Test: 183 days or more in the UK in a tax year makes you UK resident. Fewer days can also make you resident if you have UK ties.',
    sources: [
      'https://www.gov.uk/hmrc-internal-manuals/residence-and-fig-regime-manual/rfig20710',
      'https://www.gov.uk/hmrc-internal-manuals/residence-and-fig-regime-manual/rfig20730',
      'https://www.gov.uk/government/publications/rdr3-statutory-residence-test-srt/guidance-note-for-statutory-residence-test-srt-rdr3',
    ],
  },
  US: {
    country: 'US',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // physically present at any time during the day
    test: { type: 'us_spt' },
    note: 'Substantial presence test: 31 days this year and 183 days over 3 years (all of this year, a third of last year, a sixth of the year before). Days as crew of a foreign vessel do not count.',
    sources: ['https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test'],
  },
  AU: {
    country: 'AU',
    yearStart: { month: 7, day: 1 }, // income year 1 July to 30 June
    counting: 'any_part', // ATO: includes the day of arrival and departure
    test: { type: 'majority' },
    note: '183-day test: in Australia for more than half the income year. You can still be non-resident if your usual home is overseas.',
    sources: [
      'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/residency-tests/residency-the-183-day-test',
    ],
  },
  NZ: {
    country: 'NZ',
    yearStart: { month: 4, day: 1 }, // 1 April to 31 March
    counting: 'any_part', // IRD: part days count as whole days towards the 183
    test: { type: 'nz_rolling' },
    note: 'More than 183 days in New Zealand in any 12-month period makes you tax resident from the first of those days.',
    sources: ['https://www.ird.govt.nz/international-tax/individuals/tax-residency-status-for-individuals'],
  },
  ZA: {
    country: 'ZA',
    yearStart: { month: 3, day: 1 }, // 1 March to end of February
    counting: 'any_part', // Interpretation Note 4: a day includes a part of a day
    test: { type: 'za_ppt' },
    note: 'Physical presence test: more than 91 days this tax year and in each of the 5 years before, and more than 915 days over those 5 years.',
    sources: [
      'https://www.sars.gov.za/wp-content/uploads/Legal/Notes/LAPD-IntR-IN-2012-04-Resident-definition-natural-person-physical-presence.pdf',
      'https://www.sars.gov.za/individuals/tax-during-all-life-stages-and-events/tax-and-non-residents/',
    ],
  },
  IE: {
    country: 'IE',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // Revenue: present at any time during the day
    test: { type: 'ie_two_year' },
    note: '183 days in a tax year, or 280 days over this year and last. A year with 30 days or fewer does not count towards the 280.',
    sources: ['https://www.revenue.ie/en/jobs-and-pensions/tax-residence/resident-for-tax-purposes.aspx'],
  },
  CA: {
    country: 'CA',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // CRA: a part day is a day
    test: { type: 'threshold', days: 183, cmp: 'gte' },
    note: 'Sojourning 183 days or more in a calendar year can make you a deemed resident if you have no significant ties to Canada.',
    sources: [
      'https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/deemed-residents.html',
    ],
  },
  ES: {
    country: 'ES',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // Ley 35/2006 (IRPF) art. 9.1.a: more than 183 days in the calendar year; sporadic absences count as days in Spain.
    test: { type: 'threshold', days: 183, cmp: 'gt' },
    note: 'More than 183 days in Spain in a calendar year. Short trips away can still count as days in Spain.',
    sources: ['https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a9'],
  },
  FR: {
    country: 'FR',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // CGI art. 4 B: main place of stay. BOFiP: more than six months in the year is generally the main place of stay.
    test: { type: 'threshold', days: 183, cmp: 'gt' },
    note: 'More than six months in France in a year usually makes it your main place of stay. Your home, job or main income in France can also make you resident.',
    sources: ['https://bofip.impots.gouv.fr/bofip/1911-PGP.html/identifiant=BOI-IR-CHAMP-10-20130131'],
  },
  IT: {
    country: 'IT',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // TUIR art. 2 as changed by D.Lgs. 209/2023, from 2024: physical presence for most of the tax period.
    test: { type: 'majority' },
    note: 'In Italy for most of the year (183 days, or 184 in a leap year). From 2024 physical presence alone can count.',
    sources: ['https://www.agenziaentrate.gov.it/portale/documents/20143/6519685/Circolare_20_del_4_11_2024_Eng.pdf'],
  },
  DE: {
    country: 'DE',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // AO s. 9: an unbroken stay of more than six months is always a habitual abode. It is not tied to the calendar year.
    test: { type: 'de_continuous' },
    note: 'An unbroken stay of more than six months, even across the year end. Short breaks do not stop the stay; this app only joins days with no gap.',
    sources: ['https://www.gesetze-im-internet.de/ao_1977/__9.html'],
  },
};

/** Countries in the table, in the order the app lists them. */
export const TAX_RULE_COUNTRIES = ['GB', 'US', 'AU', 'NZ', 'ZA', 'IE', 'CA', 'ES', 'FR', 'IT', 'DE'];

/**
 * Countries without a day test, so they show a plain count by calendar year.
 * Listed only so the app can explain why. See the header note.
 */
export const NO_DAY_TEST_COUNTRIES = ['NL'];
