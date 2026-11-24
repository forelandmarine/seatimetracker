/**
 * Vessel lookup: Datalastic vessel_find, used only as the length fallback (see
 * services/vesselLookupSearch.ts). Datalastic bills one credit per row
 * returned, so the call is always filtered by name AND a narrow length window
 * (findLengthWindow): "YOLO" alone returns about 120 rows (120 credits), "YOLO"
 * at 35-44 m returns 1. Never throws: any failure is status 'error'.
 */

import { cleanVesselName, findLengthWindow, rowsFromVesselFind, type RawCandidate } from '../utils/vesselLookup.js';

const FIND_URL = 'https://api.datalastic.com/api/v0/vessel_find';
const TIMEOUT_MS = 10_000;

type Logger = { warn: (o: any, m?: string) => void; info?: (o: any, m?: string) => void };
type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any> }>;

export function vesselFindConfigured(): boolean {
  return !!process.env.DATALASTIC_API_KEY;
}

export interface VesselFindResult {
  status: 'ok' | 'error' | 'off';
  rows: RawCandidate[];
  window: { min: number; max: number };
}

export async function findVesselsByNameAndLength(
  rawName: string,
  lengthMetres: number,
  logger: Logger,
  fetchImpl: FetchLike = fetch as any,
): Promise<VesselFindResult> {
  const window = findLengthWindow(lengthMetres);
  const apiKey = process.env.DATALASTIC_API_KEY || '';
  const name = cleanVesselName(rawName);
  if (!apiKey) return { status: 'off', rows: [], window };
  const params = new URLSearchParams({
    'api-key': apiKey,
    name,
    length_min: String(window.min),
    length_max: String(window.max),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${FIND_URL}?${params}`, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ name, window, status: res.status }, 'Datalastic vessel_find failed');
      return { status: 'error', rows: [], window };
    }
    const body: any = await res.json();
    const data: any[] = Array.isArray(body?.data) ? body.data : [];
    // Every row returned is a credit, used or not: logged so the cost shows in the app log.
    logger.info?.({ name, window, credits: data.length }, 'Datalastic vessel_find');
    return { status: 'ok', rows: rowsFromVesselFind(data), window };
  } catch (err) {
    logger.warn({ err, name, window }, 'Datalastic vessel_find error');
    return { status: 'error', rows: [], window };
  } finally {
    clearTimeout(timer);
  }
}
