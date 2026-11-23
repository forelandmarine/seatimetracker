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
 * Added 2026-11-23 from official sources: HR, PL, PT, GR, MT, CY, GI, AE, SE,
 * NO, DK. No day test (plain count with a note): NL, BE, MC, PH.
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
  | 'any_part'
  /** Portugal: a full or part day that includes an overnight stay. Arrival and departure days count; a same-day visit does not. */
  | 'overnight'
  /** Cyprus: the day you leave is a day outside, the day you arrive a day in; a visit that starts and ends on one day counts. */
  | 'departure_out';

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
  | { type: 'de_continuous' }
  /**
   * More than / at least N days in any window of `months` months. Several tests
   * = any one is enough (Norway). `window`: 'end' = windows ending in the tax
   * year; 'start_or_end' = windows starting or ending in it (Portugal).
   */
  | { type: 'rolling'; tests: Array<{ days: number; cmp: 'gt' | 'gte'; months: number }>; window: 'end' | 'start_or_end' }
  /**
   * An unbroken stay (it can cross the year end) of `months` calendar months or
   * `days` days. Breaks of up to `breakDays` do not end it; `countBreaks` says
   * whether the break days count towards the length (Sweden, Denmark) or only
   * days present do (Croatia).
   */
  | {
      type: 'continuous';
      months?: number;
      days?: number;
      cmp: 'gt' | 'gte';
      breakDays: number;
      countBreaks: boolean;
      /** 'adjacent_stay': a break joins when no longer than the stay before or after it (max 183 days); breakDays is then unused. */
      breakRule?: 'adjacent_stay';
      /** A break with time on board outside the country (work abroad) ends the stay. */
      workBreaksEnd?: boolean;
    }
  /** Gibraltar: at least `days` in the tax year, or more than `total` over `years` consecutive tax years. */
  | { type: 'year_or_multi'; days: number; cmp: 'gt' | 'gte'; years: number; total: number };

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
  HR: {
    country: 'HR',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // Opci porezni zakon art. 43(5) (unchanged by NN 152/24 and 151/25): habitual residence = a permanent or
    // connected stay of at least 183 days in one or two calendar years; short breaks of up to a year are disregarded.
    // The law does not say whether break days count (the app counts only days present) or how arrival and departure
    // days count (any part of a day). Domicile (art. 43(1)): an owned or used home for 183 days, no stay needed.
    test: { type: 'continuous', days: 183, cmp: 'gte', breakDays: 365, countBreaks: false },
    note: 'A permanent or connected stay of at least 183 days in Croatia, in one calendar year or across two, makes it your habitual residence. Short breaks of up to a year do not end the stay. The law does not say whether break days count, so the app counts only your days in Croatia towards the 183. A home in Croatia that you own or have use of for at least 183 days makes you resident whatever your days abroad. The seafarer income exemption (183 days on ships in international traffic) is a separate rule.',
    sources: [
      'https://narodne-novine.nn.hr/clanci/sluzbeni/2016_12_115_2519.html',
      'https://porezna-uprava.gov.hr/hr/opcenito-o-dohotku/4774',
      'https://www.zakon.hr/z/100/Op%C4%87i-porezni-zakon',
    ],
  },
  PL: {
    country: 'PL',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // Ministry of Finance explanations 29.04.2021, s. 2.2: part days, arrival and departure days count
    // PIT Act art. 3 ust. 1a pkt 2: more than 183 days in the tax year; the stay need not be unbroken.
    test: { type: 'threshold', days: 183, cmp: 'gt' },
    note: 'More than 183 days in Poland in a tax year (calendar year), counting any part of a day. The days do not have to be in one stay. Your centre of personal or economic interests in Poland also makes you resident.',
    sources: [
      'https://www.gov.pl/attachment/8f2d0cf1-ee3c-49a4-ae8e-e41c4fb19df7',
    ],
  },
  PT: {
    country: 'PT',
    yearStart: { month: 1, day: 1 },
    counting: 'overnight', // CIRS art. 16(2): a full or part day that includes an overnight stay
    // CIRS art. 16(1)(a): more than 183 days, consecutive or not, in any 12 months starting or ending in the year.
    test: { type: 'rolling', tests: [{ days: 183, cmp: 'gt', months: 12 }], window: 'start_or_end' },
    note: 'More than 183 days in Portugal in any 12 months that start or end in the year. A day counts if it includes a night in Portugal, so a day trip does not. A home kept as your habitual residence also makes you resident, and crew of ships run by a Portuguese company on 31 December are resident.',
    sources: [
      'https://info.portaldasfinancas.gov.pt/pt/informacao_fiscal/codigos_tributarios/cirs_rep/Pages/irs16.aspx',
    ],
  },
  GR: {
    country: 'GR',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // AADE circular E.2064/2023 s. 7: any day present, however short
    // Income Tax Code (law 4172/2013) art. 4(2): more than 183 days in total in any 12-month period. Stays only for
    // tourism or medical reasons up to 365 days are left out (not built: rare for crew; the note says so).
    test: { type: 'rolling', tests: [{ days: 183, cmp: 'gt', months: 12 }], window: 'end' },
    note: 'More than 183 days in Greece in total in any 12 months makes you resident from your first day there, for the year the 183 days are passed. Any part of a day counts, including the days you arrive and leave; days abroad do not. Days spent only on holiday or for medical treatment are left out, unless such a stay passes 365 days. Your permanent home or centre of vital interests in Greece also makes you resident.',
    sources: [
      'https://www.aade.gr/sites/default/files/2023-10/e_2064_2023.pdf',
      'https://www.taxheaven.gr/circulars/45169/e-2064-2023',
    ],
  },
  MT: {
    country: 'MT',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // not set by law; any part of a day is the cautious reading
    // Income Tax Act Cap. 123 art. 2 has no day number (consolidated 10/03/2026). MTCA tax residence page (updated
    // 29/08/2025): more than 183 days in any particular year = resident for that year; settlers resident from arrival.
    // Shown as a guide. No seafarer residence rule found (art. 56(17) 15% rate excludes ship service).
    test: { type: 'threshold', days: 183, cmp: 'gt' },
    note: 'Malta has no day test in law: residence depends on all the facts. The tax authority says more than 183 days in Malta in a year makes you resident for that year, so the app uses that as a guide. If you move to Malta to settle, you are resident from the day you arrive. Your home, ties and how often you visit also count.',
    sources: [
      'https://legislation.mt/eli/cap/123/eng',
      'https://mtca.gov.mt/personal-tax/individual/tax-residence',
      'https://www.oecd.org/tax/automatic-exchange/crs-implementation-and-assistance/tax-residency/Malta-Residency.pdf',
    ],
  },
  CY: {
    country: 'CY',
    yearStart: { month: 1, day: 1 },
    counting: 'departure_out', // Income Tax Law 118(I)/2002 s. 2 (consolidated text, CyLaw)
    // More than 183 days in the tax year. 60-day rule (user switch tax_options.cy_60_day): at least 60 days, not
    // more than 183 days in any one other state, work/business/office in Cyprus not ended in the year, a home in
    // Cyprus. Law 244(I)/2025 (Gazette 5070, 31 Dec 2025, in force 1 Jan 2026) dropped "not resident in another state".
    test: { type: 'threshold', days: 183, cmp: 'gt' },
    note: 'More than 183 days in Cyprus in a calendar year. The day you leave counts as a day outside Cyprus and the day you arrive as a day in. Under the 60-day rule, 60 days can be enough if you spent no more than 183 days in any one other country, work, run a business or hold an office in Cyprus all year and have a home there: switch it on below if that is you. Until 2025 you also had to be tax resident nowhere else.',
    sources: [
      'https://www.cylaw.org/nomoi/enop/non-ind/2002_1_118/full.html',
      'https://www.cylaw.org/nomoi/arith/2025_1_244.pdf',
      'https://www.oecd.org/tax/automatic-exchange/crs-implementation-and-assistance/tax-residency/Cyprus-Tax-Residency.pdf',
    ],
  },
  GI: {
    country: 'GI',
    yearStart: { month: 7, day: 1 }, // year of assessment 1 July to 30 June
    counting: 'any_part', // Income Tax Act 2010 s. 74: any part of a 24-hour period from midnight
    // s. 74: at least 183 days in the year of assessment, or more than 300 days over three consecutive years.
    test: { type: 'year_or_multi', days: 183, cmp: 'gte', years: 3, total: 300 },
    note: 'At least 183 days in Gibraltar in a tax year (1 July to 30 June), or more than 300 days over three tax years in a row. Any part of a day counts. The app flags every year in a three-year run that passes 300.',
    sources: [
      'https://www.gibraltarlaws.gov.gi/uploads/legislations/income-tax/2010-21/2010-21(23-03-26).pdf',
      'https://www.gibraltar.gov.gi/income-tax-office',
    ],
  },
  AE: {
    country: 'AE',
    yearStart: { month: 1, day: 1 }, // no tax year for the test; windows ending in each calendar year
    counting: 'any_part', // Ministerial Decision 27/2023; FTA guide TPGTR1 s. 5.2.1: any part of a day
    // Cabinet Decision 85/2022 art. 4: 183 days or more in any 12 consecutive months. 90-day rule (user switch
    // tax_options.ae_90_day): 90 days or more, for UAE or GCC nationals or residence-permit holders with a home,
    // job or business in the UAE.
    test: { type: 'rolling', tests: [{ days: 183, cmp: 'gte', months: 12 }], window: 'end' },
    note: '183 days or more in the UAE in any 12 months in a row. Any part of a day counts. 90 days can be enough if you hold a UAE residence permit (or are a UAE or GCC national) and have a home, job or business in the UAE: switch it on below if that is you.',
    sources: [
      'https://tax.gov.ae/Datafolder/Files/Legislation/Corporate%20Tax/Cabinet%20Decision%2085%20of%202022%20-%20For%20publishing.pdf',
      'https://mof.gov.ae/wp-content/uploads/2023/03/Ministerial-Decision-27-of-2023-of-Tax-Residency.pdf',
    ],
  },
  SE: {
    country: 'SE',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // Inkomstskattelagen 3 kap. 3 s: stadigvarande vistelse. Skatteverket: at least six months in a row; shorter
    // breaks (e.g. visits home) do not interrupt it; HFD 2018 ref. 30 / RA 1997 ref. 25: temporary breaks carry no
    // weight. Skatteverket stallningstagande 2005-02-14 (dnr 130 92654-05/111, still in Rattslig vagledning 2026):
    // a break is temporary if no longer than the stay before or after it; over six months abroad always ends it.
    // Rattslig vagledning 2026 "Stadigvarande vistelse i Sverige": time abroad in a temporary break is not deducted.
    // Prop. 2025/26:306 (vote planned 25 Nov 2026) would replace this from 1 Jan 2027 with more than 160 days in the
    // year (120 if the year before was over 120). Not built until passed.
    test: { type: 'continuous', months: 6, cmp: 'gte', breakDays: 0, countBreaks: true, breakRule: 'adjacent_stay' },
    note: 'A stay in Sweden of at least six months in a row makes you resident. Temporary breaks, such as visits home, do not end the stay and count towards the six months. The law gives no limit; the app treats a break as temporary when it is no longer than your stay in Sweden before or after it, and never over six months. A home in Sweden, or close ties after you leave, can also make you resident. A new rule (more than 160 days in a year) is planned from 2027.',
    sources: [
      'https://www.skatteverket.se/privat/skatter/arbeteochinkomst/sabeskattasdinlon/skattskyldighet.4.65fc817e1077c25b8328000206.html',
      'https://www4.skatteverket.se/rattsligvagledning/29251.html',
      'https://www4.skatteverket.se/rattsligvagledning/edition/2026.14/2637.html',
      'https://lagen.nu/dom/hfd/2018:30',
    ],
  },
  NO: {
    country: 'NO',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part', // Skatteetaten: days spent only part of the day in Norway count
    // Skatteloven s. 2-1(2): more than 183 days in any 12 months, or more than 270 days in any 36 months.
    test: {
      type: 'rolling',
      tests: [
        { days: 183, cmp: 'gt', months: 12 },
        { days: 270, cmp: 'gt', months: 36 },
      ],
      window: 'end',
    },
    note: 'More than 183 days in Norway in any 12 months, or more than 270 days in any 36 months. Any part of a day counts and the days do not have to be in a row. You are resident from the year the count is passed.',
    sources: [
      'https://lovdata.no/dokument/NL/lov/1999-03-26-14/KAPITTEL_2',
      'https://www.skatteetaten.no/person/til-fra-norge/til/flytte/skatt-til-norge/',
    ],
  },
  DK: {
    country: 'DK',
    yearStart: { month: 1, day: 1 },
    counting: 'any_part',
    // Kildeskatteloven s. 1(1)(2): a stay of at least 6 months, including short stays abroad for holiday or similar.
    // Den juridiske vejledning 2026-2 C.F.1.3 (info.skat.dk oid=1977375): holiday trips count towards the 6 months; work abroad breaks the stay;
    // frequent breaks can too (SKM2021.217.SR: business trips are not holiday). No number of days is given (the
    // 42 days in LL s. 33 A is a different rule). The app joins a break no longer than the stay before or after it
    // (max six months) unless it has time on board outside Denmark, which it treats as work abroad.
    test: { type: 'continuous', months: 6, cmp: 'gte', breakDays: 0, countBreaks: true, breakRule: 'adjacent_stay', workBreaksEnd: true },
    note: 'A stay in Denmark of at least six months in a row makes you resident. Short holiday trips abroad do not end the stay and count towards the six months, but working abroad ends it, and so can frequent breaks. The law gives no limit; the app joins a break that is no longer than your stay before or after it, unless you logged time on board outside Denmark in it. A home in Denmark makes you resident whatever the days, and Danish citizens on ships with a Danish home port usually stay resident.',
    sources: [
      'https://www.retsinformation.dk/eli/lta/2024/460/pdf',
      'https://info.skat.dk/data.aspx?oid=1977375',
    ],
  },
};

/** Countries in the table, in the order the app lists them. */
export const TAX_RULE_COUNTRIES = ['GB', 'US', 'AU', 'NZ', 'ZA', 'IE', 'CA', 'ES', 'FR', 'IT', 'DE', 'HR', 'PL', 'PT', 'GR', 'MT', 'CY', 'GI', 'AE', 'SE', 'NO', 'DK'];

/**
 * Countries without a day test, so they show a plain count by calendar year.
 * Listed only so the app can explain why. See the header note.
 */
export const NO_DAY_TEST_COUNTRIES = ['NL', 'BE', 'MC', 'PH'];
