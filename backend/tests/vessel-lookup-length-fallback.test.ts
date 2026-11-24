/**
 * Length fallback for the vessel lookup (Datalastic vessel_find by name +
 * length window). Real case, 24 Nov 2026: a trial user searched YOLO at 38.6 m
 * and then 39.63 m three times. A web search had saved five YOLOs (34.11 m KY,
 * 20 m ES, 12 m SM, 11 m IL, 11 m US) into vessel_index, so later searches
 * stopped at the index and never showed her 40 m Jamaica YOLO (339331000).
 */
import { describe, it, expect } from 'bun:test';
import {
  findLengthWindow, fitsLength, hasLengthMatch, rowsFromVesselFind, type RawCandidate,
} from '../src/utils/vesselLookup.js';
import { runVesselLookup, type LookupSearchDeps } from '../src/services/vesselLookupSearch.js';
import { findVesselsByNameAndLength } from '../src/services/vesselFind.js';

const quiet = { warn: () => {}, info: () => {} };

// What the web search saved on her first search (source 'web').
const WEB_YOLOS: RawCandidate[] = [
  { mmsi: '319123400', name: 'YOLO', flag_iso: 'KY', length_m: 34.11, source: 'web' },
  { mmsi: '225123400', name: 'YOLO', flag_iso: 'ES', length_m: 20, source: 'web' },
  { mmsi: '268123400', name: 'YOLO', flag_iso: 'SM', length_m: 12, source: 'web' },
  { mmsi: '428123400', name: 'YOLO', flag_iso: 'IL', length_m: 11, source: 'web' },
  { mmsi: '367123400', name: 'YOLO', flag_iso: 'US', length_m: 11, source: 'web' },
];

// Datalastic vessel_find?name=YOLO&length_min=35.7&length_max=43.6, as returned 24 Nov 2026
// (one row, one credit), plus a made-up 37 m YOLO to check the closest length ranks first.
const FIND_RESPONSE = [
  { name: 'YOLO', name_ais: 'YOLO', mmsi: '339331000', imo: null, country_iso: 'JM', country_name: 'Jamaica',
    callsign: '6YRS5', type: 'Pleasure Craft', type_specific: 'Pleasure Craft', length: 40, breadth: 9, year_built: null },
  { name: 'YOLO', mmsi: '538000001', country_iso: 'MH', type: 'Yacht', length: 37 },
];

function deps(own: RawCandidate[], findRows: RawCandidate[] = rowsFromVesselFind(FIND_RESPONSE)) {
  const calls = { web: 0, find: 0, saved: [] as { mmsi: string; source: string }[] };
  const d: LookupSearchDeps = {
    searchOwn: async () => own,
    searchWeb: async () => { calls.web++; return { status: 'yes', rows: [], fresh: true }; },
    findByLength: async () => { calls.find++; return { status: 'yes', rows: findRows }; },
    save: async (row, source) => { calls.saved.push({ mmsi: row.mmsi, source }); },
  };
  return { d, calls };
}

const input = (length: number | null, unit: 'm' | 'ft' = 'm') => ({
  typedName: 'YOLO', length, unit, limit: 5,
  lengthMetres: length == null ? null : Math.round((unit === 'ft' ? length * 0.3048 : length) * 10) / 10,
});

describe('YOLO 39.63 m (24 Nov 2026 trial cancellation)', () => {
  it('ranks MMSI 339331000 first when the index only holds the wrong-length YOLOs', async () => {
    const { d, calls } = deps(WEB_YOLOS);
    const res = await runVesselLookup(input(39.63), d);
    expect(res.candidates[0].mmsi).toBe('339331000');
    expect(res.candidates[0].length_metres).toBe(40);
    expect(res.candidates[0].flag_iso).toBe('JM');
    expect(res.candidates[1].mmsi).toBe('538000001');
    expect(res.source).toBe('datalastic');
    expect(res.length_match).toBe(true);
    expect(calls.find).toBe(1); // exactly one Datalastic call
    expect(calls.web).toBe(0); // the index had name matches, so no web search
    // Saved into the index for next time
    expect(calls.saved.filter((s) => s.source === 'datalastic').map((s) => s.mmsi)).toEqual(['339331000', '538000001']);
    // The other YOLOs still show below
    expect(res.candidates.map((c) => c.mmsi)).toContain('319123400');
  });

  it('works at 38.6 m too (her first search)', async () => {
    const { d } = deps(WEB_YOLOS);
    const res = await runVesselLookup(input(38.6), d);
    expect(res.candidates[0].mmsi).toBe('339331000');
  });

  it('makes no Datalastic call once the index holds a YOLO that fits', async () => {
    const own: RawCandidate[] = [...WEB_YOLOS, { ...rowsFromVesselFind(FIND_RESPONSE)[0] }];
    const { d, calls } = deps(own);
    const res = await runVesselLookup(input(39.63), d);
    expect(calls.find).toBe(0);
    expect(res.source).toBe('index');
    expect(res.candidates[0].mmsi).toBe('339331000');
  });

  it('a different length can still bring new results (the index does not block)', async () => {
    // 34 m fits the KY YOLO already in the index: no call. 40 m does not: one call.
    const a = deps(WEB_YOLOS);
    await runVesselLookup(input(34), a.d);
    expect(a.calls.find).toBe(0);
    const b = deps(WEB_YOLOS);
    await runVesselLookup(input(40), b.d);
    expect(b.calls.find).toBe(1);
  });

  it('feet are converted before the fallback (130 ft = 39.6 m)', async () => {
    const { d, calls } = deps(WEB_YOLOS);
    const res = await runVesselLookup(input(130, 'ft'), d);
    expect(calls.find).toBe(1);
    expect(res.candidates[0].mmsi).toBe('339331000');
  });

  it('says length_match false (so the app suggests the MMSI) when Datalastic has nothing either', async () => {
    const { d, calls } = deps(WEB_YOLOS, []);
    const res = await runVesselLookup(input(39.63), d);
    expect(calls.find).toBe(1);
    expect(res.length_match).toBe(false);
    expect(res.candidates.length).toBeGreaterThan(0);
  });

  it('no length typed: no Datalastic call (a name-only find would cost ~120 credits)', async () => {
    const { d, calls } = deps(WEB_YOLOS);
    const res = await runVesselLookup(input(null), d);
    expect(calls.find).toBe(0);
    expect(res.length_match).toBeNull();
  });

  it('nothing in the index: web search first, then the fallback if the web finds no fit', async () => {
    const { d, calls } = deps([]);
    d.searchWeb = async () => { calls.web++; return { status: 'yes', rows: WEB_YOLOS, fresh: true }; };
    const res = await runVesselLookup(input(39.63), d);
    expect(calls.web).toBe(1);
    expect(calls.find).toBe(1);
    expect(res.candidates[0].mmsi).toBe('339331000');
    expect(calls.saved.filter((s) => s.source === 'web')).toHaveLength(5);
  });

  it('a capped or failed fallback still returns what we have', async () => {
    const { d } = deps(WEB_YOLOS);
    d.findByLength = async () => ({ status: 'capped', rows: [] });
    const res = await runVesselLookup(input(39.63), d);
    expect(res.find).toBe('capped');
    // Existing ranking also reads 39.63 as feet (12.1 m), so the 12 m SM YOLO leads here.
    expect(res.candidates.map((c) => c.mmsi)).toContain('319123400');
    expect(res.candidates).toHaveLength(5);
    expect(res.length_match).toBe(false);
  });
});

describe('length helpers', () => {
  it('window is +/-10%, at least +/-1.5 m', () => {
    expect(findLengthWindow(39.6)).toEqual({ min: 35.6, max: 43.6 });
    expect(findLengthWindow(12)).toEqual({ min: 10.5, max: 13.5 });
  });
  it('fits only as typed (no feet-for-metres reading)', () => {
    expect(fitsLength(40, 39.6)).toBe(true);
    expect(fitsLength(34.11, 39.6)).toBe(false);
    expect(fitsLength(12, 39.6)).toBe(false);
    expect(fitsLength(null, 39.6)).toBe(false);
  });
  it('a fit needs a real name match too', () => {
    const rows: RawCandidate[] = [{ mmsi: '235000001', name: 'SOMETHING ELSE', length_m: 40, source: 'vessels' }];
    expect(hasLengthMatch(rows, 'YOLO', 39.6)).toBe(false);
  });
  it('parses vessel_find rows and drops bad ones', () => {
    const rows = rowsFromVesselFind([...FIND_RESPONSE, { name: 'X', mmsi: '12' }, { mmsi: '339331000', name: 'YOLO' }]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ mmsi: '339331000', call_sign: '6YRS5', flag: 'Jamaica', type: 'Pleasure Craft', source: 'datalastic' });
  });
});

describe('findVesselsByNameAndLength', () => {
  it('always sends the length window with the name', async () => {
    const prev = process.env.DATALASTIC_API_KEY;
    process.env.DATALASTIC_API_KEY = 'test-key';
    let url = '';
    try {
      const res = await findVesselsByNameAndLength('M/Y Yolo', 39.6, quiet, async (u: string) => {
        url = u;
        return { ok: true, status: 200, json: async () => ({ data: FIND_RESPONSE }) };
      });
      const q = new URL(url).searchParams;
      expect(q.get('name')).toBe('YOLO');
      expect(q.get('length_min')).toBe('35.6');
      expect(q.get('length_max')).toBe('43.6');
      expect(res.status).toBe('ok');
      expect(res.rows[0].mmsi).toBe('339331000');
    } finally {
      if (prev === undefined) delete process.env.DATALASTIC_API_KEY; else process.env.DATALASTIC_API_KEY = prev;
    }
  });
  it('is off without a key and never throws', async () => {
    const prev = process.env.DATALASTIC_API_KEY;
    delete process.env.DATALASTIC_API_KEY;
    expect((await findVesselsByNameAndLength('YOLO', 40, quiet)).status).toBe('off');
    process.env.DATALASTIC_API_KEY = 'k';
    const res = await findVesselsByNameAndLength('YOLO', 40, quiet, async () => { throw new Error('down'); });
    expect(res.status).toBe('error');
    if (prev === undefined) delete process.env.DATALASTIC_API_KEY; else process.env.DATALASTIC_API_KEY = prev;
  });
});
