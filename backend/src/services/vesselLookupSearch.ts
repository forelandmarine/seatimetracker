/**
 * Vessel lookup: the search flow behind GET /api/vessels/lookup, kept apart
 * from the route (caches, caps, logging) so it can be tested with fakes.
 *
 * 1. Our own data (vessel_index + vessels table). If it has a real name match
 *    and, when a length was typed, one that fits that length, stop here.
 * 2. No name match at all: web search (as before).
 * 3. A length was typed and still nothing fits it: ONE Datalastic vessel_find
 *    by name and a narrow length window. Its rows show first, closest length
 *    first, and are saved into vessel_index so the next search finds them free.
 *
 * Step 3 is what stops a few same-name rows (say five YOLOs a web search saved,
 * none near 40 m) from blocking the right boat for good: they only count once
 * one of them fits the length the user typed, so changing the length can
 * always bring new results.
 */

import {
  rankVesselCandidates, hasLengthMatch, mergeCandidateLists,
  type RawCandidate, type VesselCandidate, type LengthUnit, type CandidateSource,
} from '../utils/vesselLookup.js';

export type WebStatus = 'yes' | 'no' | 'capped' | 'off';
/** cached = answered from the in-memory cache, no credits. */
export type FindStatus = 'yes' | 'cached' | 'no' | 'capped' | 'off' | 'error';

export interface LookupSearchDeps {
  searchOwn: () => Promise<RawCandidate[]>;
  /** Runs (or declines to run) the web search. */
  searchWeb: () => Promise<{ status: WebStatus; rows: RawCandidate[]; fresh: boolean }>;
  /** Runs (or declines to run) the one Datalastic vessel_find for this search. */
  findByLength: () => Promise<{ status: FindStatus; rows: RawCandidate[] }>;
  save: (row: RawCandidate, source: CandidateSource) => Promise<unknown>;
}

export interface LookupSearchInput {
  typedName: string;
  length: number | null;
  unit: LengthUnit;
  /** The typed length in metres, or null. */
  lengthMetres: number | null;
  limit: number;
}

export interface LookupSearchResult {
  candidates: VesselCandidate[];
  source: 'index' | 'web' | 'datalastic' | 'none';
  /** null = no length typed; false = nothing shown is near the typed length. */
  length_match: boolean | null;
  web: WebStatus;
  find: FindStatus;
  ownRows: number;
}

export async function runVesselLookup(input: LookupSearchInput, deps: LookupSearchDeps): Promise<LookupSearchResult> {
  const { typedName, length, unit, lengthMetres, limit } = input;
  const rank = (rows: RawCandidate[]) => rankVesselCandidates(rows, typedName, length, unit, limit);

  const own = await deps.searchOwn();
  const ownRanked = rank(own);
  const ownFits = hasLengthMatch(own, typedName, lengthMetres);
  if (ownRanked.strong && (lengthMetres == null || ownFits)) {
    return {
      candidates: ownRanked.candidates, source: 'index', length_match: lengthMetres == null ? null : true,
      web: 'no', find: 'no', ownRows: own.length,
    };
  }

  // Nothing in our data matches by name: try the web.
  let web: WebStatus = 'no';
  let webRows: RawCandidate[] = [];
  if (!ownRanked.strong) {
    const res = await deps.searchWeb();
    web = res.status;
    webRows = res.rows;
    // Saved unconfirmed, so the next person searching finds it without a web search.
    if (res.fresh) for (const r of webRows) await deps.save(r, 'web');
  }

  // A length was typed and nothing so far fits it: one Datalastic vessel_find.
  let find: FindStatus = 'no';
  let findRows: RawCandidate[] = [];
  if (lengthMetres != null && !hasLengthMatch([...webRows, ...own], typedName, lengthMetres)) {
    const res = await deps.findByLength();
    find = res.status;
    findRows = res.rows;
    if (find === 'yes') for (const r of findRows) await deps.save(r, 'datalastic');
  }

  // Datalastic length matches first, then web results, then everything else
  // (weak fuzzy matches from our own data included), each best first.
  const all = [...findRows, ...webRows, ...own];
  const candidates = mergeCandidateLists(
    [...rank(findRows).candidates, ...rank(webRows).candidates],
    rank(all).candidates,
    limit,
  );
  const length_match = lengthMetres == null ? null : hasLengthMatch(all, typedName, lengthMetres);
  const source = findRows.length ? 'datalastic' : webRows.length ? 'web' : candidates.length ? 'index' : 'none';
  return { candidates, source, length_match, web, find, ownRows: own.length };
}
