import { describe, it, expect } from 'bun:test';
import { cleanVesselName, lengthWindow, rankCandidates, countryName } from '../src/utils/vesselLookup.js';

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

describe('lengthWindow', () => {
  it('allows 12% either side, at least 3 m', () => {
    expect(lengthWindow(80)).toEqual({ min: 70, max: 90 });
    expect(lengthWindow(12)).toEqual({ min: 9, max: 15 });
  });
});

describe('rankCandidates', () => {
  const rows = [
    { name: 'LIONHEART', mmsi: '232010415', country_iso: 'GB', type: 'Pleasure Craft', length: 11 },
    { name: 'LIONHEART', mmsi: '244004647', country_iso: 'NL', type_specific: 'Sailing Vessel', length: 43.4 },
    { name: 'LIONHEART II', mmsi: '111111111', country_iso: 'US', type: 'Yacht', length: 43 },
    { name: 'LIONHEART', mmsi: null, length: 43 },
    { name: 'LIONHEART', mmsi: '244004647', length: 43.4 },
  ];
  it('puts the exact name with the closest length first and drops bad rows', () => {
    const c = rankCandidates(rows, 'LIONHEART', 43);
    expect(c.map(x => x.mmsi)).toEqual(['244004647', '232010415', '111111111']);
    expect(c[0].flag).toBe('Netherlands');
    expect(c[0].app_type).toBe('Sail');
    expect(c[1].app_type).toBeNull();
  });
  it('maps country codes to names', () => {
    expect(countryName('GB')).toBe('United Kingdom');
    expect(countryName(null)).toBeNull();
  });
});
