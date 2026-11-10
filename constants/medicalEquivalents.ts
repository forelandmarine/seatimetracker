/**
 * Seafarer medicals accepted instead of an ENG1, and the medical each other
 * authority the app supports asks for. Research with sources:
 * Seatime Tracker/Training Requirements Library/ENG1 alternatives 2026-11-10.md
 *
 * Text shown to users lives in i18n under "medicalAlt"; this file holds the
 * facts (who issues it, who accepts it, the source) and the i18n keys.
 */

export type MedicalKind =
  /** A national STCW medical the MCA accepts in place of an ENG1 (MSN 1815). */
  | 'eng1_equivalent'
  /** The UK ML5 for small commercial and domestic vessels. */
  | 'ml5'
  /** The medical another authority (USCG, AMSA, Maritime NZ, SAMSA, Transport Canada) asks for. */
  | 'authority';

export interface MedicalOption {
  id: string;
  kind: MedicalKind;
  /** ISO region code of the country that issues it. */
  country: string;
  /** English country name, used in "{{country}}" and to match a typed country. */
  countryName: string;
  /** Authorities (app codes) that accept it for their own certificates or ships. */
  acceptedBy: string[];
  /** On the MCA's MSN 1815 list, so accepted instead of an ENG1 on UK ships. */
  mcaAccepted: boolean;
  /** i18n key (under medicalAlt.names) for a certificate with its own name; else the generic national name. */
  nameKey?: string;
  /** i18n key (under medicalAlt.how) for how to get it; else "contact the maritime authority". */
  howKey?: string;
  /** i18n key (under medicalAlt.notes) for a condition specific to this certificate. */
  noteKey?: string;
  /** Official page that lists or explains it. */
  sourceUrl: string;
  /** Short name of that source, e.g. "MSN 1815 Amendment 7". */
  sourceName: string;
  /** Official page to find an approved doctor, where there is one. */
  finderUrl?: string;
}

export const MSN_1815_URL =
  'https://www.gov.uk/government/publications/msn-1815-mf-amendment-7-equivalent-medical-certificates/msn-1815-mf-amendment-7-countries-whose-seafarer-medical-certificates-have-been-assessed-as-meeting-international-requirements-and-are-acceptable-f';
const MSN_1815 = 'MSN 1815 Amendment 7 (Aug 2026)';
const MCA_GUIDANCE_URL = 'https://www.gov.uk/guidance/seafarers-medical-certification-guidance';

// MSN 1815 (M+F) Amendment 7, Annex 1: 28 EU/EEA countries and 15 others.
const MSN_1815_COUNTRIES: [string, string][] = [
  ['BE', 'Belgium'], ['BG', 'Bulgaria'], ['HR', 'Croatia'], ['CY', 'Cyprus'], ['CZ', 'Czech Republic'], ['DK', 'Denmark'],
  ['EE', 'Estonia'], ['FI', 'Finland'], ['FR', 'France'], ['DE', 'Germany'], ['GR', 'Greece'], ['HU', 'Hungary'],
  ['IS', 'Iceland'], ['IE', 'Ireland'], ['IT', 'Italy'], ['LV', 'Latvia'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'],
  ['MT', 'Malta'], ['NL', 'Netherlands'], ['NO', 'Norway'], ['PL', 'Poland'], ['PT', 'Portugal'], ['RO', 'Romania'],
  ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['ES', 'Spain'], ['SE', 'Sweden'],
  ['AU', 'Australia'], ['BM', 'Bermuda'], ['CA', 'Canada'], ['CN', 'China'], ['GH', 'Ghana'], ['HK', 'Hong Kong'],
  ['IN', 'India'], ['JM', 'Jamaica'], ['MU', 'Mauritius'], ['NZ', 'New Zealand'], ['PK', 'Pakistan'], ['ZA', 'South Africa'],
  ['LK', 'Sri Lanka'], ['CH', 'Switzerland'], ['UA', 'Ukraine'],
];

// What the national certificate is called and how to get it, where the authority is one the app supports
// or the MCA names something specific.
const DETAILS: Record<string, Partial<MedicalOption>> = {
  AU: {
    nameKey: 'amsa',
    howKey: 'amsa',
    acceptedBy: ['mca', 'amsa'],
    finderUrl: 'https://www.amsa.gov.au/forms/certificate-medical-fitness-international-certificates',
  },
  NZ: {
    nameKey: 'mnz',
    howKey: 'mnz',
    acceptedBy: ['mca', 'mnz'],
    finderUrl: 'https://www.maritimenz.govt.nz/commercial/seafarer-certification/approved-medical-practitioners/',
  },
  ZA: { nameKey: 'samsa', howKey: 'samsa', acceptedBy: ['mca', 'samsa'] },
  CA: {
    nameKey: 'tc',
    howKey: 'tc',
    acceptedBy: ['mca', 'transport_canada'],
    finderUrl: 'https://tc.canada.ca/en/marine-transportation/marine-training-certification-individuals/marine-medical-fitness-examiner-information/marine-medical-examiners',
  },
  // The MCA names Norway and the Netherlands as having approved doctors outside their own country.
  NO: { noteKey: 'norway', finderUrl: 'https://www.sdir.no/en/Seafarers/seafarers-health/' },
  NL: { noteKey: 'netherlands' },
  MT: { noteKey: 'malta' },
  BM: { noteKey: 'bermuda' },
};

export const MEDICAL_OPTIONS: MedicalOption[] = [
  ...MSN_1815_COUNTRIES.map(([country, countryName]): MedicalOption => ({
    id: `national_${country.toLowerCase()}`,
    kind: 'eng1_equivalent',
    country,
    countryName,
    acceptedBy: ['mca'],
    mcaAccepted: true,
    sourceUrl: MSN_1815_URL,
    sourceName: MSN_1815,
    ...DETAILS[country],
  })),
  {
    id: 'ml5',
    kind: 'ml5',
    country: 'GB',
    countryName: 'United Kingdom',
    acceptedBy: ['mca'],
    mcaAccepted: false,
    nameKey: 'ml5',
    howKey: 'ml5',
    noteKey: 'ml5',
    sourceUrl: 'https://www.gov.uk/government/publications/ml5-medical-report-form-and-certificate-msf-4112',
    sourceName: 'MCA ML5 (MSF 4112)',
  },
  {
    // Not on MSN 1815: a USCG medical certificate is not accepted instead of an ENG1.
    id: 'uscg',
    kind: 'authority',
    country: 'US',
    countryName: 'United States',
    acceptedBy: ['uscg'],
    mcaAccepted: false,
    nameKey: 'uscg',
    howKey: 'uscg',
    noteKey: 'uscg',
    sourceUrl: 'https://www.ecfr.gov/current/title-46/chapter-I/subchapter-B/part-10/subpart-C',
    sourceName: '46 CFR 10.302',
  },
];

/** Authority codes the app uses, and the country that issues for each. */
export const AUTHORITY_MEDICAL_COUNTRY: Record<string, string> = {
  uscg: 'US',
  amsa: 'AU',
  mnz: 'NZ',
  samsa: 'ZA',
  transport_canada: 'CA',
};

/** Words crew type for a country that its English name doesn't cover. */
export const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ['usa', 'america', 'united states', 'us'],
  GB: ['uk', 'united kingdom', 'britain', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  NL: ['holland', 'the netherlands'],
  CZ: ['czechia'],
  NZ: ['nz', 'aotearoa'],
  AU: ['aus', 'oz'],
  ZA: ['sa', 'rsa'],
  HK: ['hongkong'],
};

/**
 * Flags crew often serve under that accept STCW medicals from other countries, so an
 * ENG1 or an MSN 1815 certificate is fine on them. Each has a note key and source.
 */
export const FLAG_RULES: { flag: string; noteKey: string; sourceUrl: string }[] = [
  {
    flag: 'KY',
    noteKey: 'cayman',
    sourceUrl:
      'https://www.cishipping.com/system/files/notices/documents/CISN%202024%20-%2001-%20Rev%2002%20-STCW%20Final.%20%28G16%2C%20S1%29%20%281%29.pdf',
  },
  { flag: 'MH', noteKey: 'marshall', sourceUrl: 'https://www.register-iri.com/wp-content/uploads/MG-7-47-1.pdf' },
  { flag: 'IM', noteKey: 'isleOfMan', sourceUrl: 'https://iomshipregistry.com/media/1990/mln-12-medical-certificates-rev3.pdf' },
];

export const MCA_MEDICAL_GUIDANCE_URL = MCA_GUIDANCE_URL;
