import { describe, it, expect } from 'bun:test';
import {
  cleanVesselName, normaliseVesselName, lengthMismatch, nameMatchScore, trigramSimilarity,
  rankVesselCandidates, parseWebReply, mergeByMmsi, countryName, vesselFromInfo, type RawCandidate,
} from '../src/utils/vesselLookup.js';
import { likeVariants, searchOwnData, upsertVesselIndex, logLookupMiss, resetVesselIndexState } from '../src/services/vesselIndex.js';
import { replyText, buildWebSearchPrompt } from '../src/services/vesselWebSearch.js';

describe('cleanVesselName', () => {
  it('drops the prefixes AIS names never carry', () => {
    expect(cleanVesselName('M/Y Christopher')).toBe('CHRISTOPHER');
    expect(cleanVesselName('SY Lionheart')).toBe('LIONHEART');
    expect(cleanVesselName('THV Galatea')).toBe('GALATEA');
    expect(cleanVesselName('  mv   Azure  Dreams ')).toBe('AZURE DREAMS');
  });
  it('keeps names that only look like prefixes', () => {
    expect(cleanVesselName('MYSTIC')).toBe('MYSTIC');
    expect(cleanVesselName('L Symphony')).toBe('L SYMPHONY');
  });
});

describe('normaliseVesselName', () => {
  it('turns roman numerals into digits and drops punctuation', () => {
    expect(normaliseVesselName('Lionheart II')).toBe('LIONHEART 2');
    expect(normaliseVesselName('M/Y Lionheart 2')).toBe('LIONHEART 2');
    expect(normaliseVesselName("Serenity's-Dream")).toBe('SERENITY S DREAM');
    expect(normaliseVesselName('Côte d’Azur')).toBe('COTE D AZUR');
  });
  it('leaves a leading or lone I alone', () => {
    expect(normaliseVesselName('I Love It')).toBe('I LOVE IT');
    expect(normaliseVesselName('Henry I')).toBe('HENRY 1');
  });
  it('gives the vessels table both spellings to try', () => {
    expect(likeVariants('Lionheart 2')).toEqual(['LIONHEART 2', 'LIONHEART II']);
  });
});

describe('nameMatchScore', () => {
  it('ranks exact over prefix over contains over fuzzy', () => {
    const q = normaliseVesselName('Serenity');
    expect(nameMatchScore('SERENITY', q)).toBe(1);
    expect(nameMatchScore('SERENITY II', q)).toBe(0.8);
    expect(nameMatchScore('BLUE SERENITY', q)).toBe(0.65);
    const fuzzy = nameMatchScore('SERENITTY', q);
    expect(fuzzy).toBeGreaterThan(0.1);
    expect(fuzzy).toBeLessThan(0.5);
    expect(trigramSimilarity('abc', 'xyz')).toBe(0);
  });
});

describe('lengthMismatch', () => {
  it('reads metres as typed, or as feet with a small penalty', () => {
    expect(lengthMismatch(43, 43, 'm')).toBe(0);
    // 42 typed as metres for a 12.8 m boat: read as 42 ft = 12.8 m, plus the penalty
    expect(lengthMismatch(12.8, 42, 'm')!).toBeCloseTo(0.05, 2);
    expect(lengthMismatch(12.8, 42, 'ft')!).toBeCloseTo(0, 2);
    // In feet mode there is no metres reading
    expect(lengthMismatch(42, 42, 'ft')!).toBeGreaterThan(2);
    expect(lengthMismatch(null, 42, 'm')).toBeNull();
    expect(lengthMismatch(40, null, 'm')).toBeNull();
  });
});

const row = (r: Partial<RawCandidate> & { mmsi: string; name: string }): RawCandidate => ({ source: 'vessels', ...r });

describe('rankVesselCandidates', () => {
  const rows: RawCandidate[] = [
    row({ name: 'LIONHEART', mmsi: '232010415', flag_iso: 'GB', type: 'Pleasure Craft', length_m: 11 }),
    row({ name: 'LIONHEART', mmsi: '244004647', flag_iso: 'NL', type: 'Sailing Vessel', length_m: 43.4, source: 'datalastic' }),
    row({ name: 'LIONHEART II', mmsi: '366111111', flag_iso: 'US', type: 'Yacht', length_m: 43 }),
    row({ name: 'LIONHEART', mmsi: '244004647', length_m: 43.4, imo: '1234567' }),
    row({ name: 'LIONHEART', mmsi: '12345' }),
    row({ name: 'LIONHEART', mmsi: '987654321' }), // starts with 9: not a ship MMSI
    row({ name: 'LIONHEART', mmsi: '235000001', length_m: null }),
    row({ name: 'NOTHING ALIKE', mmsi: '235000002', length_m: 43 }),
  ];

  it('puts the right length first, keeps null lengths, drops bad rows and non-matches', () => {
    const { candidates, strong } = rankVesselCandidates(rows, 'SY Lionheart', 43, 'm');
    expect(strong).toBe(true);
    const mmsis = candidates.map((c) => c.mmsi);
    expect(mmsis[0]).toBe('244004647');
    expect(mmsis).toContain('235000001'); // no length, still shown
    expect(mmsis).not.toContain('12345');
    expect(mmsis).not.toContain('987654321');
    expect(mmsis).not.toContain('235000002');
    expect(candidates.length).toBeLessThanOrEqual(5);
    expect(candidates[0].flag).toBe('Netherlands');
    expect(candidates[0].app_type).toBe('Sail');
    expect(candidates[0].imo).toBe('1234567'); // gap filled from the other row
  });

  it('ranks a small boat first when the typed number only fits as feet', () => {
    const { candidates } = rankVesselCandidates(rows, 'Lionheart', 36, 'm'); // 36 ft = 11 m
    expect(candidates[0].mmsi).toBe('232010415');
    const ft = rankVesselCandidates(rows, 'Lionheart', 36, 'ft');
    expect(ft.candidates[0].mmsi).toBe('232010415');
  });

  it('ranks by name alone without a length', () => {
    const { candidates } = rankVesselCandidates(rows, 'Lionheart 2', null, 'm');
    expect(candidates[0].mmsi).toBe('366111111');
  });

  it('finds a renamed vessel by its former name', () => {
    const r = rankVesselCandidates([row({ name: 'NEW NAME', mmsi: '235000003', former_names: ['NEPENTHE'], source: 'datalastic' })], 'Nepenthe', null, 'm');
    expect(r.strong).toBe(true);
    expect(r.candidates[0].former_names).toEqual(['NEPENTHE']);
  });

  it('is not strong when only fuzzy matches exist', () => {
    expect(rankVesselCandidates([row({ name: 'SERENITTY', mmsi: '235000004' })], 'Serenity', null, 'm').strong).toBe(false);
  });
});

describe('IMO grouping', () => {
  // HBC: reflagged from the UK to the Cook Islands and renamed (formerly C2, B2).
  const hbc: RawCandidate[] = [
    row({ name: 'HBC', mmsi: '232056602', imo: '1009833', flag_iso: 'GB', length_m: 40, source: 'web', former_names: ['C2'] }),
    row({ name: 'HBC', mmsi: '518999718', imo: '1009833', flag_iso: 'CK', length_m: 40, source: 'web', former_names: ['B2'] }),
    row({ name: 'HBC TWO', mmsi: '235000005', length_m: 12 }),
  ];
  it('shows one candidate per ship with the other MMSI as an alternate', () => {
    const { candidates } = rankVesselCandidates(hbc, 'HBC', 40, 'm');
    const ships = candidates.filter((c) => c.imo === '1009833');
    expect(ships.length).toBe(1);
    const ship = ships[0];
    expect([ship.mmsi, ...ship.alt_mmsis].sort()).toEqual(['232056602', '518999718']);
    expect(ship.former_names.sort()).toEqual(['B2', 'C2']);
  });
  it('prefers the MMSI most recently confirmed on AIS', () => {
    const confirmed = [
      hbc[0],
      { ...hbc[1], source: 'datalastic' as const, last_confirmed_at: '2026-10-31T00:00:00Z' },
    ];
    const { candidates } = rankVesselCandidates(confirmed, 'HBC', 40, 'm');
    expect(candidates[0].mmsi).toBe('518999718');
    expect(candidates[0].alt_mmsis).toEqual(['232056602']);
  });
  it('prefers a user vessel over web rows when nothing is confirmed', () => {
    const { candidates } = rankVesselCandidates([hbc[0], { ...hbc[1], source: 'vessels' as const }], 'HBC', null, 'm');
    expect(candidates[0].mmsi).toBe('518999718');
  });
});

describe('mergeByMmsi', () => {
  it('keeps the best source and fills gaps', () => {
    const merged = mergeByMmsi([
      row({ name: 'SERENITY', mmsi: '235000006', source: 'web', call_sign: 'MABC1', former_names: ['OLD ONE'] }),
      row({ name: 'SERENITY', mmsi: '235000006', source: 'vessels', length_m: 30 }),
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe('vessels');
    expect(merged[0].call_sign).toBe('MABC1');
    expect(merged[0].length_m).toBe(30);
    expect(merged[0].former_names).toEqual(['OLD ONE']);
  });
});

describe('parseWebReply', () => {
  it('reads JSON wrapped in prose and checks every field', () => {
    const text = `Here is what I found:\n{"candidates":[
      {"name":"m/y Serenity","mmsi":"235 012 345","imo":"IMO 9123456","call_sign":"zabc1","flag":"GB","length_m":"45.5","former_names":["Old Name", 7, ""],"source_url":"https://www.vesselfinder.com/x"},
      {"name":"Bad MMSI","mmsi":"12345678"},
      {"name":"Group call","mmsi":"023500000"},
      {"name":"Bad IMO","mmsi":"244004647","imo":"12","length_m":9999,"source_url":"javascript:alert(1)"},
      {"name":"","mmsi":"244004648"},
      {"name":"Duplicate","mmsi":"235012345"}
    ]}\nHope that helps.`;
    const rows = parseWebReply(text);
    expect(rows.map((r) => r.mmsi)).toEqual(['235012345', '244004647']);
    const [a, b] = rows;
    expect(a.name).toBe('SERENITY');
    expect(a.imo).toBe('9123456');
    expect(a.call_sign).toBe('ZABC1');
    expect(a.flag).toBe('United Kingdom');
    expect(a.flag_iso).toBe('GB');
    expect(a.length_m).toBe(45.5);
    expect(a.former_names).toEqual(['OLD NAME', '7']);
    expect(a.source).toBe('web');
    expect(b.imo).toBeNull();
    expect(b.length_m).toBeNull();
    expect(b.source_url).toBeNull();
  });
  it('returns nothing for junk', () => {
    expect(parseWebReply('')).toEqual([]);
    expect(parseWebReply('No vessel found.')).toEqual([]);
    expect(parseWebReply('{not json}')).toEqual([]);
    expect(parseWebReply('{"candidates":"none"}')).toEqual([]);
  });
});

describe('web search reply handling', () => {
  const quiet = { warn: () => {} };
  it('drops refusals and reads text blocks', () => {
    expect(replyText({ stop_reason: 'refusal', content: [{ type: 'text', text: '{}' }] }, quiet)).toBeNull();
    expect(replyText({ stop_reason: 'end_turn', content: [
      { type: 'server_tool_use', id: 'x', name: 'web_search', input: {} },
      { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
      { type: 'text', text: '{"candidates":' }, { type: 'text', text: '[]}' },
    ] }, quiet)).toBe('{"candidates":[]}');
  });
  it('puts the name and length in the prompt', () => {
    const p = buildWebSearchPrompt('Serenity', 42, 'ft');
    expect(p).toContain('Vessel name: Serenity');
    expect(p).toContain('about 42 feet');
    expect(p).toContain('"Serenity MMSI"');
    expect(buildWebSearchPrompt('X', null, 'm')).toContain('not given');
  });
});

describe('vesselFromInfo', () => {
  it('maps a Datalastic vessel_info record', () => {
    const v = vesselFromInfo({
      name: 'HBC', mmsi: 518999718, imo: '1009833', country_iso: 'CK', country_name: 'Cook Islands',
      type: 'Pleasure Craft', type_specific: 'Yacht', length: 40.2, year_built: 2004, callsign: 'E5U1234',
      last_position_epoch: 1761868800,
    }, '518999718')!;
    expect(v.mmsi).toBe('518999718');
    expect(v.flag).toBe('Cook Islands');
    expect(v.app_type).toBe('Motor');
    expect(v.year_built).toBe('2004');
    expect(v.call_sign).toBe('E5U1234');
    expect(v.last_position_at).toBe('2025-10-31T00:00:00.000Z');
  });
  it('rejects a record with no name or MMSI', () => {
    expect(vesselFromInfo({}, '518999718')).toBeNull();
  });
});

describe('degrades without the vessel_index SQL', () => {
  const missingTable = Object.assign(new Error('relation "vessel_index" does not exist'), { code: '42P01' });
  const missingFn = Object.assign(new Error('function similarity does not exist'), { code: '42883' });
  const warnings: string[] = [];
  const logger = { warn: (_o: any, m?: string) => { warnings.push(m ?? ''); } };

  it('still searches the vessels table, warns once, and never throws', async () => {
    resetVesselIndexState();
    warnings.length = 0;
    let calls = 0;
    const db = {
      execute: async (q: any) => {
        calls++;
        const text = JSON.stringify(q);
        if (text.includes('vessel_index') || text.includes('vessel_lookup_misses')) throw missingTable;
        if (text.includes('similarity')) throw missingFn;
        return [{ mmsi: '235000007', vessel_name: 'M/Y Serenity', ais_name: null, imo_number: null, callsign: null, flag: 'United Kingdom', type: 'Motor', length_metres: '30.00' }];
      },
    };
    const rows = await searchOwnData(db, 'Serenity', logger);
    expect(rows.map((r) => [r.mmsi, r.name, r.length_m])).toEqual([['235000007', 'SERENITY', 30]]);
    expect(await upsertVesselIndex(db, { mmsi: '235000007', name: 'SERENITY', source: 'web' }, 'web', logger)).toBe(false);
    await logLookupMiss(db, { userId: 'u', name: 'X', length: null, unit: 'm', webSearched: 'no' }, logger);
    const before = calls;
    // Second search: no more attempts on the missing table or similarity()
    await searchOwnData(db, 'Serenity', logger);
    expect(calls - before).toBe(1);
    expect(warnings.filter((w) => w.includes('vessel_index table missing')).length).toBe(1);
    expect(warnings.some((w) => w.includes('pg_trgm'))).toBe(true);
    resetVesselIndexState();
  });
});

describe('countryName', () => {
  it('maps country codes to names', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName(null)).toBeNull();
  });
});
