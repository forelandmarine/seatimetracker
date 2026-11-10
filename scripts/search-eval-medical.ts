// ENG1 alternatives in Find a course: a medical search shows ENG1 doctors and,
// separately, the medicals accepted instead of an ENG1 (MSN 1815, ML5) or the
// one the user's own authority asks for, leading where no MCA doctor is listed.
//   npx tsx scripts/search-eval-medical.ts      (exits 1 if any case fails)
import { searchProviders, searchHomeCountry } from '@/utils/providerSearch';
import { medicalAlternatives, isMedicalSearch, queryWithout } from '@/utils/medicalAlternatives';
import { TRAINING_PROVIDERS_JSON } from '@/backend/src/data/training-providers';
const list = JSON.parse(TRAINING_PROVIDERS_JSON).providers as any[];

interface Case {
  q: string;
  authority?: string | null;
  region?: string | null;
  origin?: [number, number];
  course?: string | null;
  /** Option ids expected, in this order, at the start of the options (authority option first when set). */
  first?: string[];
  /** Country the options are for. */
  country?: string | null;
  lead?: boolean;
  /** At least one ENG1 doctor in the top 10 rows the screen shows. */
  doctors?: boolean;
  /** Not a medical search: no section at all. */
  none?: boolean;
}

const CASES: Case[] = [
  // UK crew: ENG1 doctors first, ML5 after them.
  { q: 'eng1', authority: 'mca', first: ['ml5'], country: 'GB', lead: false, doctors: true },
  { q: 'eng 1', authority: 'mca', first: ['ml5'], lead: false, doctors: true },
  { q: 'medical', authority: 'mca', first: ['ml5'], lead: false, doctors: true },
  { q: 'seafarer medical', authority: 'mca', first: ['ml5'], doctors: true },
  { q: 'seafarers medical near me', authority: 'mca', first: ['ml5'], doctors: true },
  { q: 'medcial', authority: 'mca', first: ['ml5'], doctors: true },
  { q: 'eng1 doctor southampton', authority: 'mca', first: ['ml5'], country: 'GB', lead: false, doctors: true },
  { q: 'ml5', authority: 'mca', first: ['ml5'], lead: true, doctors: true },
  { q: 'ml5 medical', authority: 'mca', first: ['ml5'], lead: true, doctors: true },
  { q: '', course: 'ml5', authority: 'mca', first: ['ml5'], lead: true, doctors: true },
  { q: '', course: 'eng1', authority: 'mca', first: ['ml5'], lead: false, doctors: true },
  // A country with no MCA doctor: lead with its own certificate.
  { q: 'eng1 norway', authority: 'mca', first: ['national_no'], country: 'NO', lead: true, doctors: true },
  { q: 'medical norway', authority: 'mca', first: ['national_no'], country: 'NO', lead: true, doctors: true },
  { q: 'eng1 croatia', authority: 'mca', first: ['national_hr'], country: 'HR', lead: true, doctors: true },
  { q: 'seafarer medical Split', authority: 'mca', first: ['national_hr'], country: 'HR', lead: true, doctors: true },
  { q: 'eng1 Italy', authority: 'mca', first: ['national_it'], country: 'IT', lead: true, doctors: true },
  { q: 'medical Genoa', authority: 'mca', first: ['national_it'], country: 'IT', lead: true },
  { q: 'eng1 the netherlands', authority: 'mca', first: ['national_nl'], country: 'NL', lead: true, doctors: true },
  { q: 'eng1 holland', authority: 'mca', first: ['national_nl'], country: 'NL', lead: true, doctors: true },
  { q: 'eng1 greece', authority: 'mca', first: ['national_gr'], country: 'GR', lead: true, doctors: true },
  { q: 'medical athens', authority: 'mca', first: ['national_gr'], country: 'GR', lead: true },
  { q: 'eng1 india', authority: 'mca', first: ['national_in'], country: 'IN', lead: true, doctors: true },
  { q: 'eng1 Iceland', authority: 'mca', first: ['national_is'], country: 'IS', lead: true, doctors: true },
  { q: 'eng1 Sri Lanka', authority: 'mca', first: ['national_lk'], country: 'LK', lead: true, doctors: true },
  { q: 'eng1 Malta', authority: 'mca', first: ['national_mt'], country: 'MT', lead: true, doctors: true },
  { q: 'eng1 canada', authority: 'mca', first: ['national_ca'], country: 'CA', lead: true, doctors: true },
  { q: 'eng1 hong kong', authority: 'mca', first: ['national_hk'], country: 'HK', lead: true, doctors: true },
  // Phone in a country with no MCA doctor, no place typed.
  { q: 'eng1', authority: null, region: 'NO', first: ['national_no'], country: 'NO', lead: true, doctors: true },
  { q: 'seafarer medical', authority: null, region: 'DE', first: ['national_de'], country: 'DE', lead: true, doctors: true },
  { q: 'eng1', authority: 'mca', origin: [43.51, 16.44], first: ['national_hr'], country: 'HR', lead: true, doctors: true },
  // A country with MCA doctors: doctors first, the local certificate after them.
  { q: 'eng1 spain', authority: 'mca', first: ['national_es'], country: 'ES', lead: false, doctors: true },
  { q: 'eng1 Palma', authority: 'mca', first: ['national_es'], country: 'ES', lead: false, doctors: true },
  { q: 'eng1 Antibes', authority: 'mca', first: ['national_fr'], country: 'FR', lead: false, doctors: true },
  { q: 'medical france', authority: 'mca', first: ['national_fr'], country: 'FR', lead: false, doctors: true },
  { q: 'eng1 gibraltar', authority: 'mca', first: [], country: 'GI', lead: false, doctors: true },
  // US: the USCG certificate, and that it is not an ENG1 equivalent.
  { q: 'eng1 fort lauderdale', authority: 'mca', first: ['uscg'], country: 'US', lead: false, doctors: true },
  { q: 'eng1 usa', authority: 'mca', first: ['uscg'], country: 'US', lead: false, doctors: true },
  // Other authorities: their own medical first.
  { q: 'medical', authority: 'uscg', first: ['uscg'], country: 'US', lead: true },
  { q: 'mariner physical', authority: 'uscg', first: ['uscg'], lead: true },
  { q: 'eng1', authority: 'amsa', first: ['national_au'], country: 'AU', lead: true, doctors: true },
  { q: 'medical', authority: 'amsa', first: ['national_au'], lead: true },
  { q: 'medical', authority: 'mnz', first: ['national_nz'], lead: true },
  { q: 'medical certificate', authority: 'samsa', first: ['national_za'], lead: true },
  { q: 'eng1 cape town', authority: 'mca', first: ['national_za'], country: 'ZA', lead: false, doctors: true },
  // An AMSA user asking about Norway gets both.
  { q: 'eng1 norway', authority: 'amsa', first: ['national_au', 'national_no'], country: 'NO', lead: true },
  // Not about the medical.
  { q: 'medical care', authority: 'mca', none: true },
  { q: 'medical first aid antibes', authority: 'mca', none: true },
  { q: 'proficiency in medical care', authority: 'mca', none: true },
  { q: 'stcw basic', authority: 'mca', none: true },
  { q: 'yachtmaster norway', authority: 'mca', none: true },
  { q: 'us coast guard', authority: 'mca', none: true },
];

let pass = 0;
for (const c of CASES) {
  const homeCountry = searchHomeCountry(c.authority ?? null, c.region ?? 'GB');
  const origin = c.origin ? { lat: c.origin[0], lng: c.origin[1] } : null;
  const course = c.course ?? null;
  const m = medicalAlternatives(list, { query: c.q, course, authority: c.authority ?? null, origin, homeCountry });
  const problems: string[] = [];
  if (c.none) {
    if (m) problems.push('showed a medical section');
  } else if (!m) problems.push('no medical section');
  else {
    const ids = [m.authorityOption?.id, ...m.options.map((o) => o.id)].filter(Boolean);
    if (c.first && c.first.some((id, i) => ids[i] !== id)) problems.push(`options ${ids.join(',') || '-'}`);
    if (c.country !== undefined && m.country !== c.country) problems.push(`country ${m.country}`);
    if (c.lead !== undefined && m.lead !== c.lead) problems.push(`lead ${m.lead}`);
    if (ids.some((id) => id === 'uscg') && m.options.find((o) => o.id === 'uscg')?.mcaAccepted) problems.push('uscg marked accepted');
  }
  if (c.doctors) {
    const f = { query: c.q, course, sector: null, approval: null, origin, radiusKm: null, homeCountry };
    let hits = searchProviders(list, f);
    if (!hits.length && m?.countryWords.length) hits = searchProviders(list, { ...f, query: queryWithout(c.q, m.countryWords) });
    if (!hits.slice(0, 10).some((h) => h.provider.courses.includes('eng1'))) problems.push(`no ENG1 doctor in top 10 (${hits.length} rows)`);
  }
  const ok = problems.length === 0;
  if (ok) pass++;
  console.log(ok ? 'PASS' : 'FAIL', JSON.stringify(c.q || `[course ${c.course}]`).padEnd(30), (c.authority ?? `phone ${c.region}`).padEnd(9), ok ? '' : problems.join('; '));
}
console.log(`medical: ${pass}/${CASES.length}`);
if (!isMedicalSearch('eng1', null) || isMedicalSearch('stcw', null)) {
  console.log('FAIL isMedicalSearch basics');
  process.exit(1);
}
if (pass < CASES.length) process.exit(1);
