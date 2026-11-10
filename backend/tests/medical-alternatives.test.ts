import { describe, it, expect } from 'bun:test';
// App code, resolved through the root tsconfig's "@/" paths.
import { medicalAlternatives, isMedicalSearch, countryInQuery, queryWithout } from '../../utils/medicalAlternatives';
import { MEDICAL_OPTIONS } from '../../constants/medicalEquivalents';
import { typesSatisfying, evaluateItem, courseCodeForType } from '../../utils/courseChecklist';
import { TRAINING_PROVIDERS_JSON } from '../src/data/training-providers.js';

const list = JSON.parse(TRAINING_PROVIDERS_JSON).providers;
const ctx = { course: null, authority: 'mca', origin: null, homeCountry: 'GB' };

describe('ENG1 alternatives data', () => {
  it('lists the 43 MSN 1815 countries once each, all with a source', () => {
    const eq = MEDICAL_OPTIONS.filter((o) => o.kind === 'eng1_equivalent');
    expect(eq.length).toBe(43);
    expect(new Set(eq.map((o) => o.country)).size).toBe(43);
    expect(eq.every((o) => o.mcaAccepted && o.sourceUrl.startsWith('https://www.gov.uk/'))).toBe(true);
  });
  it('does not mark the USCG certificate or the ML5 as an ENG1 equivalent', () => {
    expect(MEDICAL_OPTIONS.find((o) => o.id === 'uscg')!.mcaAccepted).toBe(false);
    expect(MEDICAL_OPTIONS.find((o) => o.id === 'ml5')!.mcaAccepted).toBe(false);
    expect(MEDICAL_OPTIONS.some((o) => o.kind === 'eng1_equivalent' && ['US', 'GB'].includes(o.country))).toBe(false);
  });
});

describe('medical search', () => {
  it('knows a medical search from a medical course', () => {
    expect(isMedicalSearch('eng1', null)).toBe(true);
    expect(isMedicalSearch('ENG-1 doctor', null)).toBe(true);
    expect(isMedicalSearch('seafarer medical', null)).toBe(true);
    expect(isMedicalSearch('medical care', null)).toBe(false);
    expect(isMedicalSearch('medical first aid', null)).toBe(false);
    expect(isMedicalSearch('', 'ml5')).toBe(true);
  });
  it('reads a country from the query, but not "us" in lower case', () => {
    expect(countryInQuery('eng1 South Africa')?.country).toBe('ZA');
    expect(countryInQuery('medical USA')?.country).toBe('US');
    expect(countryInQuery('doctors near us')).toBeNull();
    expect(queryWithout('eng1 Sri Lanka', ['sri', 'lanka'])).toBe('eng1');
  });
  it('leads with the local certificate where no MCA doctor is listed', () => {
    const m = medicalAlternatives(list, { ...ctx, query: 'eng1 norway' })!;
    expect(m.country).toBe('NO');
    expect(m.hasMcaDoctor).toBe(false);
    expect(m.lead).toBe(true);
    expect(m.options[0].id).toBe('national_no');
  });
  it('puts ENG1 doctors first where there are some', () => {
    const m = medicalAlternatives(list, { ...ctx, query: 'eng1 spain' })!;
    expect(m.hasMcaDoctor).toBe(true);
    expect(m.lead).toBe(false);
    expect(m.options[0].id).toBe('national_es');
  });
  it("shows another authority's own medical first", () => {
    const m = medicalAlternatives(list, { ...ctx, authority: 'uscg', homeCountry: 'US', query: 'medical' })!;
    expect(m.authorityOption?.id).toBe('uscg');
    expect(m.lead).toBe(true);
  });
  it('returns nothing for other searches', () => {
    expect(medicalAlternatives(list, { ...ctx, query: 'stcw basic' })).toBeNull();
  });
});

describe('oral checklist', () => {
  const item = { code: 'eng1', label: 'ENG1 or accepted equivalent medical', type: 'medical' as const, validity: 'as_dated' as const };
  const cert = (type: string, expiry: string) => ({
    id: 'c1',
    certificate_type: type,
    certificate_name: null,
    certificate_number: 'N1',
    issuing_body: 'Norwegian Maritime Authority',
    issued_date: '2026-01-01',
    expiry_date: expiry,
  });
  it('counts an accepted alternative medical as the ENG1', () => {
    expect(typesSatisfying('eng1')).toContain('accepted_seafarer_medical');
    expect(courseCodeForType('accepted_seafarer_medical')).toBe('eng1');
    const s = evaluateItem(item, [cert('accepted_seafarer_medical', '2027-12-31') as any], new Date('2026-11-10'));
    expect(s.status).toBe('done');
  });
  it('treats an expired alternative like an expired ENG1', () => {
    const s = evaluateItem(item, [cert('accepted_seafarer_medical', '2026-10-01') as any], new Date('2026-11-10'));
    expect(s.status).toBe('expired');
  });
  it('does not count a USCG medical certificate', () => {
    const s = evaluateItem(item, [cert('uscg_medical_certificate', '2027-12-31') as any], new Date('2026-11-10'));
    expect(s.status).toBe('todo');
  });
});
