/**
 * Find a vessel's MMSI from its name (and, as a hint, its length) for people
 * who don't have the MMSI to hand when they add a vessel. Pure helpers here:
 * name normalisation, ranking, grouping by IMO and checking the web-search
 * reply. The database search lives in services/vesselIndex.ts, the web
 * fallback in services/vesselWebSearch.ts and the route in routes/vessel-lookup.ts.
 *
 * Searching never calls Datalastic (it bills per row returned). Only the
 * confirm step makes one Datalastic call, for the vessel the user picked.
 */

// Prefixes people type that AIS names never carry ("M/Y Christopher" is
// CHRISTOPHER on AIS).
const NAME_PREFIX = /^(M\/?Y|S\/?Y|M\/?V|M\/?S|S\/?V|THV|HMS|R\/?V|MSV|CTV|F\/?V)\.?\s+/i;

export function cleanVesselName(raw: string): string {
  return (raw || '')
    .trim()
    .replace(NAME_PREFIX, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

const ROMAN: Record<string, string> = {
  I: '1', II: '2', III: '3', IV: '4', V: '5', VI: '6', VII: '7', VIII: '8', IX: '9', X: '10',
};

/**
 * Name used for matching (stored as vessel_index.name_norm): prefix stripped,
 * upper case, punctuation removed, roman numerals as digits ("LIONHEART II"
 * and "Lionheart 2" both become LIONHEART 2). A lone "I" is left alone unless
 * it is the last word, so "I LOVE IT" keeps its I.
 */
export function normaliseVesselName(raw: string): string {
  const words = cleanVesselName(raw)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(' ')
    .filter(Boolean);
  return words
    .map((w, i) => (ROMAN[w] && (w !== 'I' || (i === words.length - 1 && words.length > 1)) ? ROMAN[w] : w))
    .join(' ');
}

export type LengthUnit = 'm' | 'ft';
export const FT_TO_M = 0.3048;

export function parseLength(raw: unknown): number | null {
  const n = Number(String(raw ?? '').replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function toMetres(length: number, unit: LengthUnit): number {
  return unit === 'ft' ? length * FT_TO_M : length;
}

export const metresToFeet = (m: number) => m / FT_TO_M;

// Penalty added when the typed number only fits if read in the other unit.
const ALT_UNIT_PENALTY = 0.05;

/**
 * How far a candidate's length is from what was typed, as a fraction (0 = spot
 * on). With unit 'm' the number is also tried as feet ("42" typed as metres by
 * someone who meant feet still ranks a 13 m boat well), with a small penalty.
 * Null when there is nothing to compare.
 */
export function lengthMismatch(candidateMetres: number | null, typed: number | null, unit: LengthUnit): number | null {
  if (typed == null || candidateMetres == null || !(candidateMetres > 0)) return null;
  const asTyped = toMetres(typed, unit);
  let best = Math.abs(candidateMetres - asTyped) / asTyped;
  if (unit === 'm') {
    const asFeet = typed * FT_TO_M;
    best = Math.min(best, Math.abs(candidateMetres - asFeet) / asFeet + ALT_UNIT_PENALTY);
  }
  return best;
}

/** Trigram similarity as pg_trgm works it out (words padded, set overlap). */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const set = new Set<string>();
    for (const w of s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      const p = `  ${w} `;
      for (let i = 0; i + 3 <= p.length; i++) set.add(p.slice(i, i + 3));
    }
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

/** 0..1, how well a vessel name matches the (normalised) query. */
export function nameMatchScore(candidateName: string, query: string): number {
  const n = normaliseVesselName(candidateName);
  if (!n || !query) return 0;
  if (n === query) return 1;
  if (n.startsWith(query) || query.startsWith(n)) return 0.8;
  if (n.includes(query) || (` ${query} `.includes(` ${n} `))) return 0.65;
  return trigramSimilarity(n, query) * 0.6;
}

/** A name match at or above this counts as a real match (stops the web fallback). */
export const STRONG_NAME_MATCH = 0.5;

export type CandidateSource = 'vessels' | 'web' | 'datalastic';

/** A row from our own data (vessel_index, vessels table) or the web search. */
export interface RawCandidate {
  mmsi: string;
  name: string;
  imo?: string | null;
  call_sign?: string | null;
  flag?: string | null;
  flag_iso?: string | null;
  type?: string | null;
  length_m?: number | null;
  year_built?: string | null;
  former_names?: string[] | null;
  source: CandidateSource;
  last_confirmed_at?: Date | string | null;
  source_url?: string | null;
}

export interface VesselCandidate {
  mmsi: string;
  name: string;
  imo: string | null;
  flag: string | null;       // country name, e.g. "United Kingdom"
  flag_iso: string | null;
  type: string | null;       // AIS type, e.g. "Yacht", "Tug"
  app_type: 'Motor' | 'Sail' | null;
  length_metres: number | null;
  year_built: string | null;
  call_sign: string | null;
  former_names: string[];
  /** Other MMSIs the same ship (same IMO) has used, e.g. before a reflag. */
  alt_mmsis: string[];
  source: CandidateSource;
}

const regionNames = (() => {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; }
})();

export function countryName(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try { return regionNames?.of(iso.toUpperCase()) ?? iso; } catch { return iso; }
}

/** Only say Sail when the type says so; a "Pleasure Craft" can be either. */
export function appTypeFor(type: string | null | undefined): 'Motor' | 'Sail' | null {
  const t = String(type || '');
  if (/sail/i.test(t)) return 'Sail';
  if (/yacht|motor/i.test(t)) return 'Motor';
  return null;
}

// Ship station MMSIs start with a maritime identification digit 2 to 7.
export const isShipMmsi = (v: string) => /^[2-7]\d{8}$/.test(v);
export const isImo = (v: string) => /^\d{7}$/.test(v);

const SOURCE_RANK: Record<CandidateSource, number> = { datalastic: 0, vessels: 1, web: 2 };
const uniq = (xs: (string | null | undefined)[]) =>
  Array.from(new Set(xs.map((x) => (x || '').trim()).filter(Boolean)));

const time = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() || 0 : 0);

/** Same MMSI from several sources: one row, best source first, gaps filled from the others. */
export function mergeByMmsi(rows: RawCandidate[]): RawCandidate[] {
  const byMmsi = new Map<string, RawCandidate[]>();
  for (const r of rows) {
    const mmsi = String(r.mmsi || '').replace(/\D/g, '');
    if (!isShipMmsi(mmsi) || !String(r.name || '').trim()) continue;
    const list = byMmsi.get(mmsi) ?? [];
    list.push({ ...r, mmsi, name: String(r.name).trim() });
    byMmsi.set(mmsi, list);
  }
  const out: RawCandidate[] = [];
  for (const list of byMmsi.values()) {
    list.sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source] || time(b.last_confirmed_at) - time(a.last_confirmed_at));
    const pick = <K extends keyof RawCandidate>(k: K) => list.find((r) => r[k] != null && r[k] !== '')?.[k] ?? null;
    const first = list[0];
    out.push({
      ...first,
      imo: pick('imo') as string | null,
      call_sign: pick('call_sign') as string | null,
      flag: pick('flag') as string | null,
      flag_iso: pick('flag_iso') as string | null,
      type: pick('type') as string | null,
      length_m: pick('length_m') as number | null,
      year_built: pick('year_built') as string | null,
      // Other rows' own names are not treated as former names: a user may have typed it differently.
      former_names: uniq(list.flatMap((r) => r.former_names || []))
        .filter((n) => normaliseVesselName(n) !== normaliseVesselName(first.name)),
      last_confirmed_at: list.map((r) => r.last_confirmed_at).filter(Boolean).sort((a, b) => time(b) - time(a))[0] ?? null,
    });
  }
  return out;
}

interface Scored { row: RawCandidate; score: number; name: number }

export function scoreCandidate(row: RawCandidate, query: string, length: number | null, unit: LengthUnit): Scored {
  const direct = nameMatchScore(row.name, query);
  const former = Math.max(0, ...(row.former_names || []).map((f) => nameMatchScore(f, query) - 0.1));
  const name = Math.max(direct, former);
  const mismatch = lengthMismatch(row.length_m ?? null, length, unit);
  // Length only nudges the order. A row with no length sits a little below a good fit.
  const lengthPenalty = length == null ? 0 : mismatch == null ? 0.15 : Math.min(mismatch, 1) * 0.5;
  return { row, score: name - lengthPenalty, name };
}

/**
 * Rows sharing an IMO are the same ship under different MMSIs (a reflag, often
 * with a rename). Show one candidate: the MMSI most recently confirmed on AIS,
 * else the best ranked, carrying the others as alt_mmsis and their names as
 * former names. The confirm step tries the alternates if the first is not live.
 */
export function groupByImo(scored: Scored[]): { primary: RawCandidate; members: RawCandidate[]; score: number; name: number }[] {
  const groups: { primary: RawCandidate; members: RawCandidate[]; score: number; name: number }[] = [];
  const byImo = new Map<string, number>();
  for (const s of scored) {
    const imo = s.row.imo && isImo(String(s.row.imo)) ? String(s.row.imo) : null;
    const at = imo ? byImo.get(imo) : undefined;
    if (at === undefined) {
      if (imo) byImo.set(imo, groups.length);
      groups.push({ primary: s.row, members: [s.row], score: s.score, name: s.name });
    } else {
      const g = groups[at];
      g.members.push(s.row);
      g.score = Math.max(g.score, s.score);
      g.name = Math.max(g.name, s.name);
    }
  }
  for (const g of groups) {
    if (g.members.length < 2) continue;
    const confirmed = g.members.filter((m) => m.source === 'datalastic' && m.last_confirmed_at)
      .sort((a, b) => time(b.last_confirmed_at) - time(a.last_confirmed_at));
    const fromUsers = g.members.filter((m) => m.source === 'vessels');
    g.primary = confirmed[0] ?? fromUsers[0] ?? g.members[0];
  }
  return groups;
}

export function toCandidate(primary: RawCandidate, members: RawCandidate[] = [primary]): VesselCandidate {
  const pick = <K extends keyof RawCandidate>(k: K) =>
    (primary[k] ?? members.find((m) => m[k] != null && m[k] !== '')?.[k] ?? null);
  const iso = (pick('flag_iso') as string | null) || null;
  const type = (pick('type') as string | null) || null;
  const len = pick('length_m') as number | null;
  return {
    mmsi: primary.mmsi,
    name: primary.name,
    imo: (pick('imo') as string | null) || null,
    flag: (pick('flag') as string | null) || countryName(iso),
    flag_iso: iso,
    type,
    app_type: appTypeFor(type),
    length_metres: len != null && Number.isFinite(Number(len)) ? Math.round(Number(len) * 10) / 10 : null,
    year_built: (pick('year_built') as string | null) || null,
    call_sign: (pick('call_sign') as string | null) || null,
    former_names: uniq([...members.flatMap((m) => m.former_names || []), ...members.map((m) => m.name)])
      .filter((n) => normaliseVesselName(n) !== normaliseVesselName(primary.name)),
    alt_mmsis: uniq(members.map((m) => m.mmsi)).filter((m) => m !== primary.mmsi),
    source: primary.source,
  };
}

/**
 * Our own rows (and web rows) -> up to `limit` candidates, best first. Length
 * ranks, never filters: rows with no length still show.
 */
export function rankVesselCandidates(
  rows: RawCandidate[],
  rawQuery: string,
  length: number | null,
  unit: LengthUnit,
  limit = 5,
): { candidates: VesselCandidate[]; strong: boolean } {
  const query = normaliseVesselName(rawQuery);
  const scored = mergeByMmsi(rows)
    .map((r) => scoreCandidate(r, query, length, unit))
    .filter((s) => s.name > 0.15 || s.row.source === 'web')
    .sort((a, b) => b.score - a.score || SOURCE_RANK[a.row.source] - SOURCE_RANK[b.row.source] || a.row.name.localeCompare(b.row.name));
  const groups = groupByImo(scored).sort((a, b) => b.score - a.score);
  return {
    candidates: groups.slice(0, limit).map((g) => toCandidate(g.primary, g.members)),
    strong: groups.some((g) => g.name >= STRONG_NAME_MATCH),
  };
}

export interface ConfirmedVessel extends VesselCandidate {
  /** When AIS last heard from it, ISO time, if Datalastic gave one. */
  last_position_at: string | null;
  /** Port or area AIS last placed it in, if given. */
  area: string | null;
  /** The MMSI the user picked, when a different (live) MMSI was returned. */
  former_mmsi: string | null;
}

/** Datalastic vessel_info record -> confirmed vessel. */
export function vesselFromInfo(data: Record<string, any>, fallbackMmsi: string): ConfirmedVessel | null {
  const mmsi = String(data.mmsi ?? fallbackMmsi).replace(/\D/g, '');
  const name = cleanVesselName(String(data.name || data.vessel_name || ''));
  if (!isShipMmsi(mmsi) || !name) return null;
  const imo = String(data.imo ?? '').replace(/\D/g, '');
  const iso = data.country_iso ? String(data.country_iso).toUpperCase() : null;
  const type = data.type_specific || data.type || null;
  const len = parseLength(data.length);
  const when = data.last_position_UTC || data.last_position_epoch || data.timestamp || null;
  let lastAt: string | null = null;
  if (when != null) {
    const n = Number(when);
    const d = Number.isFinite(n) && n > 0 ? new Date(n < 1e11 ? n * 1000 : n) : new Date(String(when));
    lastAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return {
    mmsi,
    name,
    imo: isImo(imo) ? imo : null,
    flag: data.country_name || countryName(iso),
    flag_iso: iso,
    type,
    app_type: appTypeFor(type),
    length_metres: len != null ? Math.round(len * 10) / 10 : null,
    year_built: data.year_built != null && data.year_built !== '' ? String(data.year_built) : null,
    call_sign: data.callsign ? String(data.callsign) : null,
    former_names: [],
    alt_mmsis: [],
    source: 'datalastic',
    last_position_at: lastAt,
    area: data.current_port || data.last_port || null,
    former_mmsi: null,
  };
}

/**
 * The web-search model's reply -> checked rows. It is asked for JSON only but
 * may wrap it in prose, so the outermost {...} is taken. Anything without a
 * proper ship MMSI is dropped; a bad IMO is blanked, not trusted.
 */
export function parseWebReply(text: string): RawCandidate[] {
  if (!text) return [];
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let body: any;
  try { body = JSON.parse(text.slice(start, end + 1)); } catch { return []; }
  const list: any[] = Array.isArray(body?.candidates) ? body.candidates : [];
  const str = (v: unknown, max = 80) => (typeof v === 'string' || typeof v === 'number') && String(v).trim()
    ? String(v).trim().slice(0, max) : null;
  const out: RawCandidate[] = [];
  const seen = new Set<string>();
  for (const c of list.slice(0, 10)) {
    if (!c || typeof c !== 'object') continue;
    const mmsi = String(c.mmsi ?? '').replace(/\s+/g, '');
    const name = str(c.name);
    if (!isShipMmsi(mmsi) || !name || seen.has(mmsi)) continue;
    seen.add(mmsi);
    const imoRaw = String(c.imo ?? '').replace(/^IMO\s*/i, '').replace(/\s+/g, '');
    const len = parseLength(c.length_m);
    const url = str(c.source_url, 500);
    const flag = str(c.flag, 60);
    out.push({
      mmsi,
      name: cleanVesselName(name),
      imo: isImo(imoRaw) ? imoRaw : null,
      call_sign: str(c.call_sign, 12)?.toUpperCase() ?? null,
      flag: flag && /^[A-Za-z]{2}$/.test(flag) ? countryName(flag) : flag,
      flag_iso: flag && /^[A-Za-z]{2}$/.test(flag) ? flag.toUpperCase() : null,
      type: str(c.type, 60),
      length_m: len != null && len >= 2 && len <= 500 ? len : null,
      former_names: Array.isArray(c.former_names)
        ? uniq(c.former_names.map((f: unknown) => str(f)).filter(Boolean).map((f: string) => cleanVesselName(f))).slice(0, 10)
        : [],
      source: 'web',
      source_url: url && /^https?:\/\//i.test(url) ? url : null,
    });
  }
  return out;
}
