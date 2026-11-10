/**
 * Report context for a list of entries: each vessel's identity on the entry's
 * day (renames, reflags) and its sole watchkeeper periods. Both are read in
 * one round trip instead of one after the other.
 */
import type { App } from '../index.js';
import { attachIdentity, identityChanges } from './vesselIdentity.js';
import { attachSoleWatch, loadSoleWatchPeriods } from './soleWatch.js';

/** Same result as entriesWithSoleWatch(app, await entriesWithIdentity(app, entries)). */
export async function entriesWithIdentityAndSoleWatch<E extends { vessel_id: string; start_time: Date | string; service_type?: string | null; vessel?: any }>(
  app: App,
  entries: E[]
) {
  const vesselIds = [...new Set(entries.map((e) => e.vessel_id))];
  const [changes, periods] = await Promise.all([identityChanges(app, vesselIds), loadSoleWatchPeriods(app, vesselIds)]);
  return attachSoleWatch(attachIdentity(entries, changes), periods);
}
