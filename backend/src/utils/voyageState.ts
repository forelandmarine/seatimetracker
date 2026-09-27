/**
 * Voyage state: is the vessel underway, at anchor or moored, and has it
 * reached the destination it is broadcasting on AIS?
 *
 * Speed alone is a poor signal. A yacht lying at anchor off its destination
 * reads the same as one hove-to mid-passage, and the old logic treated every
 * stop the same way, so a passage entry could keep growing for days after the
 * vessel had arrived. This module combines three signals:
 *
 * 1. AIS navigational status (when the crew set it): underway, at anchor, moored.
 * 2. Speed over ground, which always wins over a stale status (a vessel doing
 *    9 knots is underway whatever the status field says).
 * 3. Distance from the destination port, resolved from the AIS destination
 *    (UN/LOCODE such as "ES VLG", or free text such as "SOLLER").
 *
 * Anchor rules (see SEA_SERVICE_LOGIC.md, "Actual Day at Sea"): anchor time
 * only counts toward a passage when it is part of an active passage and is not
 * the final end of it. So a stop at the destination closes the passage, and a
 * stop elsewhere closes it once it has lasted longer than the passage leg that
 * led to it.
 */

import { calculateDistanceNauticalMiles } from './seaTime.js';

/** Same threshold the AIS fetchers use to set `is_moving`. */
export const MOVING_SPEED_KNOTS = 2;

/** Within this distance of the destination port, a stopped vessel has arrived. */
export const ARRIVAL_RADIUS_NM = 3;

export type NavState = 'underway' | 'anchored' | 'moored' | 'unknown';
export type VesselActivity = 'underway' | 'at_anchor' | 'moored' | 'stopped' | 'unknown';

/**
 * Map an AIS navigational status (numeric code or provider text) to a coarse state.
 * Codes per ITU-R M.1371: 0 under way using engine, 1 at anchor, 5 moored,
 * 6 aground, 8 under way sailing. Everything else (restricted manoeuvrability,
 * fishing, not defined, ...) says nothing reliable about passage state.
 */
export function parseNavStatus(raw: string | number | null | undefined): NavState {
  if (raw === null || raw === undefined) return 'unknown';
  const text = String(raw).trim().toLowerCase();
  if (text === '') return 'unknown';

  if (/^\d+$/.test(text)) {
    const code = parseInt(text, 10);
    if (code === 0 || code === 8) return 'underway';
    if (code === 1) return 'anchored';
    if (code === 5 || code === 6) return 'moored';
    return 'unknown';
  }

  if (text.includes('anchor')) return 'anchored';
  if (text.includes('moored') || text.includes('aground') || text.includes('berth')) return 'moored';
  if (text.includes('under way') || text.includes('underway') || text.includes('sailing')) return 'underway';
  return 'unknown';
}

/**
 * Combine speed and navigational status. Speed is measured, the status is typed
 * in by the crew and is often left stale, so speed decides whenever they disagree.
 */
export function classifyActivity(
  speedKnots: number | null | undefined,
  navStatus: string | number | null | undefined
): VesselActivity {
  const nav = parseNavStatus(navStatus);
  const hasSpeed = speedKnots !== null && speedKnots !== undefined && !isNaN(speedKnots);

  if (hasSpeed && speedKnots! > MOVING_SPEED_KNOTS) return 'underway';

  if (hasSpeed) {
    if (nav === 'anchored') return 'at_anchor';
    if (nav === 'moored') return 'moored';
    return 'stopped';
  }

  // No speed: fall back on the status alone.
  if (nav === 'underway') return 'underway';
  if (nav === 'anchored') return 'at_anchor';
  if (nav === 'moored') return 'moored';
  return 'unknown';
}

export interface PortPosition {
  name: string;
  unlocode: string | null;
  latitude: number;
  longitude: number;
}

/**
 * True when a vessel that is not underway is lying within ARRIVAL_RADIUS_NM of
 * its destination port.
 */
export function hasArrivedAtDestination(
  activity: VesselActivity,
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  port: PortPosition | null
): boolean {
  if (!port || activity === 'underway' || activity === 'unknown') return false;
  if (latitude == null || longitude == null || isNaN(latitude) || isNaN(longitude)) return false;
  return calculateDistanceNauticalMiles(latitude, longitude, port.latitude, port.longitude) <= ARRIVAL_RADIUS_NM;
}

/**
 * Normalise an AIS destination that looks like a UN/LOCODE ("ES VLG", "ESVLG",
 * "ES-VLG", "es vlg") to its 5-character form. Returns null for free text.
 */
export function normaliseLocode(destination: string | null | undefined): string | null {
  if (!destination) return null;
  const m = destination.trim().toUpperCase().match(/^([A-Z]{2})[\s\-_.]?([A-Z2-9]{3})$/);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Destinations crews type that are not places. */
const NON_PORT_DESTINATIONS = /^(FOR ORDERS|ORDERS|CHARTER|CRUISING|CRUISE|SEA TRIALS?|TRIALS?|TBA|TBC|N\/?A|NONE|UNKNOWN|LOCAL|AT SEA|ANCHORAGE|OFFSHORE|FISHING|\W*)$/;

/**
 * Decide, for a stop that interrupts a passage, whether the passage entry
 * should be closed (and any later movement start a new entry) or bridged.
 *
 * - A stop at the destination is the final end of the passage: close.
 * - A stop anywhere that has lasted longer than the leg before it is not an
 *   operational pause (berth wait, lock, weather): close.
 * - Otherwise the stop is bridged and the passage continues.
 */
export function shouldCloseVoyageAtStop(params: {
  arrivedAtDestination: boolean;
  stoppedHours: number;
  precedingLegHours: number;
}): boolean {
  if (params.arrivedAtDestination) return true;
  return params.stoppedHours > Math.max(params.precedingLegHours, 0);
}

// ---------------------------------------------------------------------------
// Destination port lookup (Datalastic port_find), cached per process.
// ---------------------------------------------------------------------------

const PORT_FIND_URL = 'https://api.datalastic.com/api/v0/port_find';
const PORT_CACHE_HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PORT_CACHE_MISS_TTL_MS = 12 * 60 * 60 * 1000;
const PORT_FETCH_TIMEOUT_MS = 8_000;

const portCache = new Map<string, { value: PortPosition | null; expires: number }>();

/** For tests. */
export function clearPortCache(): void {
  portCache.clear();
}

/**
 * Resolve an AIS destination to a port position. UN/LOCODEs are looked up
 * exactly; free text is accepted only on an exact name match so a vague entry
 * never places a vessel "at its destination" somewhere it isn't.
 * Never throws: any failure resolves to null and arrival detection is skipped.
 */
export async function resolveDestinationPort(
  destination: string | null | undefined,
  options: { apiKey?: string; fetchImpl?: typeof fetch; logger?: { warn: (...a: any[]) => void } } = {}
): Promise<PortPosition | null> {
  const apiKey = options.apiKey ?? process.env.DATALASTIC_API_KEY ?? '';
  const fetchImpl = options.fetchImpl ?? fetch;
  if (!destination || !apiKey) return null;

  const cleaned = destination.trim().toUpperCase().replace(/\s+/g, ' ');
  if (NON_PORT_DESTINATIONS.test(cleaned)) return null;

  const locode = normaliseLocode(cleaned);
  const cacheKey = locode ? `L:${locode}` : `N:${cleaned}`;
  const cached = portCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  let value: PortPosition | null = null;
  try {
    const query = locode
      ? `unlocode=${encodeURIComponent(locode)}`
      : `name=${encodeURIComponent(cleaned)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PORT_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(`${PORT_FIND_URL}?api-key=${encodeURIComponent(apiKey)}&${query}`, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      options.logger?.warn({ destination, status: res.status }, 'Destination port lookup failed');
      // Do not cache HTTP failures; try again next time.
      return null;
    }
    const body: any = await res.json();
    const rows: any[] = Array.isArray(body?.data) ? body.data : [];
    const match = locode
      ? rows.find(r => String(r.unlocode || '').toUpperCase() === locode)
      : rows.find(r => String(r.port_name || '').trim().toUpperCase() === cleaned);
    if (match && typeof match.lat === 'number' && typeof match.lon === 'number') {
      value = {
        name: String(match.port_name),
        unlocode: match.unlocode ? String(match.unlocode) : null,
        latitude: match.lat,
        longitude: match.lon,
      };
    }
  } catch (err) {
    options.logger?.warn({ err, destination }, 'Destination port lookup error');
    return null;
  }

  portCache.set(cacheKey, {
    value,
    expires: Date.now() + (value ? PORT_CACHE_HIT_TTL_MS : PORT_CACHE_MISS_TTL_MS),
  });
  return value;
}
