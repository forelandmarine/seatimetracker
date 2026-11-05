import { describe, it, expect } from 'bun:test';
import { TRAINING_PROVIDERS_JSON } from '../src/data/training-providers.js';

interface Provider {
  id: string;
  name: string;
  city: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  approvals: string[];
  courses: string[];
}

const directory = JSON.parse(TRAINING_PROVIDERS_JSON) as { v: number; providers: Provider[] };
const eng1 = directory.providers.filter((p) => p.courses.includes('eng1'));

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};

describe('Find a course directory', () => {
  it('parses with unique ids and a name and country on every provider', () => {
    expect(directory.v).toBe(1);
    const ids = new Set(directory.providers.map((p) => p.id));
    expect(ids.size).toBe(directory.providers.length);
    expect(directory.providers.every((p) => p.name && /^[A-Z]{2}$/.test(p.country))).toBe(true);
  });

  it('lists the MCA approved doctors for ENG1 medicals, not just training centres', () => {
    // GOV.UK lists about 150 surgeries (UK, Crown Dependencies and overseas).
    expect(eng1.length).toBeGreaterThan(140);
    expect(eng1.filter((p) => p.country === 'GB').length).toBeGreaterThan(100);
    // The app starts on the user's own authority, so MCA crew only see MCA-approved entries.
    expect(eng1.filter((p) => p.approvals.includes('mca')).length).toBeGreaterThan(140);
    expect(eng1.every((p) => p.lat != null && p.lng != null)).toBe(true);
  });

  it('puts every pin inside its own country (no "Channel Isles" in Florida)', () => {
    const near = (p: Provider, lat: number, lng: number, limit: number) => p.lat == null || km(lat, lng, p.lat, p.lng!) <= limit;
    for (const p of directory.providers.filter((x) => x.country === 'JE' || x.country === 'GG')) expect({ id: p.id, ok: near(p, 49.35, -2.4, 120) }).toEqual({ id: p.id, ok: true });
    for (const p of directory.providers.filter((x) => x.country === 'GI' || x.country === 'MT')) expect({ id: p.id, ok: near(p, 36.0, -5.35, 80) || near(p, 35.9, 14.45, 80) }).toEqual({ id: p.id, ok: true });
  });

  it('has an ENG1 doctor within 40 km of the main yacht and workboat ports', () => {
    const ports: [string, number, number][] = [
      ['Southampton', 50.9, -1.4],
      ['Falmouth', 50.15, -5.07],
      ['Aberdeen', 57.15, -2.1],
      ['Great Yarmouth', 52.6, 1.73],
      ['Palma', 39.57, 2.65],
      ['Antibes', 43.58, 7.12],
      ['Fort Lauderdale', 26.12, -80.14],
    ];
    for (const [port, lat, lng] of ports) {
      const near = eng1.filter((p) => km(lat, lng, p.lat!, p.lng!) <= 40);
      expect({ port, found: near.length > 0 }).toEqual({ port, found: true });
    }
  });
});
