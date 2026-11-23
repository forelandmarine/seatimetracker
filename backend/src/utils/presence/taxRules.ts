/**
 * Tax day rules per country (2.5.0 "Days abroad").
 *
 * A small table of day-count tests for countries common among crew. Each rule
 * says when the country's tax year starts, how a day is counted, and which test
 * the day count is held against. It is guidance only: every country also has
 * tests that are not about days (a home, family, centre of interests), and
 * treaties can override all of it.
 *
 * Checked on 2026-11-10 against the official pages listed in `sources`, and
 * re-checked on 2026-11-22 against the full official pages and, where it could
 * be reached, the law itself. Re-checked 2026-11-23 for how each country treats
 * days away and days with no record (only Spain adds them; Germany disregards
 * short breaks in its unbroken-stay test). The full notes live in "Tax days and Schengen
 * research 2026-11-10.md" (Store Uploads 2.5.0).
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
  /** New Zealand: more than 183 days in total in any 12-month period (a calendar 12 months, so 366 days when it spans 29 February). */
  | { type: 'nz_rolling' }
  /** Germany: an unbroken stay of more than six months, which can cross the year end. */
  /**
   * Germany: an unbroken stay of more than six months (calendar months from the
   * day of arrival, so 182 to 185 days depending on the start), across the year end.
   */
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
    // A day counts if you are in the UK at midnight (RFIG20710). Deeming, transit and
    // exceptional-circumstances rules are not modelled (RFIG20720, RFIG20730).
    test: { type: 'threshold', days: 183, cmp: 'gte' },
    note: 'Statutory Residence Test: 183 days or more in the UK in a tax year makes you UK resident. With fewer days you can still be resident through a UK home, full-time UK work or UK ties, and days you leave before midnight can count if you have 3 or more UK ties.',
    sources: [
      'https://www.gov.uk/hmrc-internal-manuals/residence-and-fig-regime-manual/rfig20720',
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
    // 26 USC 7701(b)(3) and (7). The crew exception in 7701(b)(7)(D) is narrow: temporarily present as a
    // regular crew member of a foreign vessel engaged in transportation between the US and a foreign
    // country or US possession, and not otherwise in a US trade or business that day.
    note: 'Substantial presence test: 31 days this year and 183 days over 3 years (all of this year, a third of last year, a sixth of the year before). Days as regular crew of a foreign vessel travelling between the US and abroad may not count, but only if you do no other work in the US those days: check before turning those stays off. With fewer than 183 days this year, a closer connection to another country can still make you non-resident.',
    sources: [
      'https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test',
      'https://www.law.cornell.edu/uscode/text/26/7701',
    ],
  },
  AU: {
    country: 'AU',
    yearStart: { month: 7, day: 1 }, // income year 1 July to 30 June
    counting: 'any_part', // ATO: includes the day of arrival and departure
    test: { type: 'majority' },
    // ITAA 1936 s 6(1) "resident", para (a)(ii).
    note: '183-day test: in Australia for more than half the income year (183 days, or 184 in a leap year) makes you resident, unless your usual home is overseas and you do not intend to live in Australia. Living in Australia or an Australian domicile can make you resident with fewer days.',
    sources: [
      'https://www.legislation.gov.au/C1936A00027/latest/text',
      'https://www.ato.gov.au/individuals-and-families/coming-to-australia-or-going-overseas/residency-tests/residency-the-183-day-test',
    ],
  },
  NZ: {
    country: 'NZ',
    yearStart: { month: 4, day: 1 }, // 1 April to 31 March
    counting: 'any_part', // IRD: part days count as whole days towards the 183
    test: { type: 'nz_rolling' },
    // Income Tax Act 2007 s YD 1(3), (4), (8). Non-resident visitors (s YD 1(13), YD 1B, from 1 April 2026; IR292): when the
    // user switches it on (tax_options.nz_visitor), more than 275 days in any 18 months instead (presence.ts).
    note: 'More than 183 days in New Zealand in any 12-month period makes you tax resident from the first of those days. A permanent place of abode in New Zealand makes you resident whatever the days. From 1 April 2026 some short-term visitors are treated as non-resident for up to 275 days in any 18 months: switch it on below if you qualify.',
    sources: [
      'https://www.ird.govt.nz/international-tax/individuals/tax-residency-status-for-individuals',
      'https://www.legislation.govt.nz/act/public/2007/0097/latest/DLM1520575.html',
    ],
  },
  ZA: {
    country: 'ZA',
    yearStart: { month: 3, day: 1 }, // 1 March to end of February
    counting: 'any_part', // Interpretation Note 4: a day includes a part of a day
    test: { type: 'za_ppt' },
    note: 'Physical presence test: more than 91 days this tax year and in each of the 5 years before, and more than 915 days over those 5 years. If you ordinarily live in South Africa you are resident whatever the days.',
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
    // TCA 1997 s 819, as set out in Revenue Tax and Duty Manual Part 34-00-01.
    note: '183 days in a tax year, or 280 days over this year and last. A year with 30 days or fewer does not count towards the 280, and you are not resident in that year under the 280-day test.',
    sources: [
      'https://www.revenue.ie/en/jobs-and-pensions/tax-residence/resident-for-tax-purposes.aspx',
      'https://www.revenue.ie/en/tax-professionals/tdm/income-tax-capital-gains-tax-corporation-tax/part-34/34-00-01.pdf',
    ],
  },
  CA: {
    country: 'CA',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // CRA: a part day is a day
    test: { type: 'threshold', days: 183, cmp: 'gte' },
    // ITA s 250(1)(a).
    note: 'Staying 183 days or more in a calendar year can make you a deemed resident if you have no significant ties to Canada. If you do have significant ties (a home, a partner or dependants in Canada) you can be resident whatever the days.',
    sources: [
      'https://laws-lois.justice.gc.ca/eng/acts/I-3.3/section-250.html',
      'https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/individuals-leaving-entering-canada-non-residents/deemed-residents.html',
    ],
  },
  ES: {
    country: 'ES',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // Ley 35/2006 (IRPF) art. 9.1.a: more than 183 days in the calendar year; sporadic absences count as days in Spain
    // unless tax residence elsewhere is proven. TEAC RG 04812/2020 (25 Apr 2023): days between two days proven in Spain
    // count unless presence outside Spain is proven. STS 28 Nov 2017 (appeals 812/2017, 815/2017): an absence of more
    // than 183 days is not sporadic. Applied in taxDays (presence.ts).
    test: { type: 'threshold', days: 183, cmp: 'gt' },
    note: 'More than 183 days in Spain in a calendar year. Days between two stays in Spain count as days in Spain, whether nothing is logged or you logged a trip away, unless you hold a tax residence certificate from another country; a single absence of more than 183 days is not added. Your main business or economic interests in Spain, or a spouse and young children living there, can also make you resident.',
    sources: [
      'https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764#a9',
      'https://sede.agenciatributaria.gob.es/Sede/informacion-institucional/puede-interesar/sobre-agencia-tributaria/2023/junio/9/teac-define-concepto-dias-permanencia-espana.html',
    ],
  },
  FR: {
    country: 'FR',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // CGI art. 4 B: main place of stay. BOFiP BOI-IR-CHAMP-10 §130-150: more than six months in the year is generally
    // the main place of stay (not an absolute test). More than six months = more than half the year: 183 days, 184 in a
    // leap year (changed 2026-11-23 from "more than 183", which was a day too strict).
    test: { type: 'majority' },
    note: 'More than six months in France in a year usually makes it your main place of stay, but it is not an absolute test. Your home, job or main economic interests in France can also make you resident.',
    sources: ['https://bofip.impots.gouv.fr/bofip/1911-PGP.html/identifiant=BOI-IR-CHAMP-10-20160728'],
  },
  IT: {
    country: 'IT',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // TUIR art. 2 as changed by D.Lgs. 209/2023, from 2024: physical presence for most of the tax period.
    test: { type: 'majority' },
    note: 'In Italy for most of the year (183 days, or 184 in a leap year), counting any part of a day. From 2024 physical presence alone can count. Your home, family ties or registration in Italy can also make you resident.',
    sources: ['https://www.agenziaentrate.gov.it/portale/documents/20143/6519685/Circolare_20_del_4_11_2024_Eng.pdf'],
  },
  DE: {
    country: 'DE',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // AO s. 9: an unbroken stay of more than six months is always a habitual abode. It is not tied to the calendar year.
    // Sentence 2: short breaks are disregarded (AEAO zu s. 9: home trips, annual leave, cures, business trips). The app
    // joins runs across breaks of up to DE_MAX_SHORT_BREAK_DAYS (presence.ts), counting the break days.
    test: { type: 'de_continuous' },
    // Satz 3: not for stays only for visits, holidays, a cure or similar private purposes of up to a year.
    note: 'An unbroken stay of more than six months, even across the year end, makes Germany your habitual abode from the first day. This does not apply to purely private visits or holidays of up to a year. A home in Germany makes you resident whatever the days. Short breaks (home trips, leave, business trips) do not stop the stay; the law gives no limit, and the app joins stays across breaks of up to six weeks, counting the break days.',
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
