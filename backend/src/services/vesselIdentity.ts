/**
 * Picks up MMSI, flag, call sign and name changes from AIS and keeps them as a
 * dated history (vessel_identity_changes):
 *
 * - MMSI and flag are applied automatically and the user is told.
 * - Call sign follows AIS (it changes with the flag).
 * - A new name is only suggested (vessels.pending_name): AIS names are upper case
 *   and cut to 20 characters, so the user decides whether to rename.
 *
 * Changes are detected against the last values AIS reported (ais_name, ais_flag),
 * never against what the user typed, so "SY Lionheart" vs "LIONHEART" is not a change.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { sendPushToUser } from '../utils/push.js';
import { flagName, identityAsOf, periodKey, sameCode, sameName, type IdentityChange } from '../utils/vesselIdentity.js';

type Vessel = typeof schema.vessels.$inferSelect;

export class VesselIdentityError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const today = () => new Date().toISOString().slice(0, 10);

async function record(app: App, vesselId: string, field: string, oldValue: string | null, newValue: string | null, source: 'ais' | 'user', effective = today()) {
  await app.db.insert(schema.vessel_identity_changes).values({
    vessel_id: vesselId,
    field,
    old_value: oldValue,
    new_value: newValue,
    effective_date: effective,
    source,
  });
  app.logger.info({ vesselId, field, oldValue, newValue, effective, source }, 'Vessel identity change recorded');
}

/**
 * Called when AIS moved a vessel to a new MMSI (found by IMO). Records the MMSI,
 * and the flag and call sign that came with it, as changes from today.
 */
export async function recordMmsiChange(
  app: App,
  vessel: Pick<Vessel, 'id' | 'mmsi' | 'flag' | 'ais_flag' | 'callsign'>,
  found: { mmsi: string; flag?: string | null; callsign?: string | null }
): Promise<Record<string, any>> {
  const updates: Record<string, any> = {};
  await record(app, vessel.id, 'mmsi', vessel.mmsi, found.mmsi, 'ais');
  const knownFlag = vessel.ais_flag ?? vessel.flag;
  if (found.flag && !sameCode(found.flag, knownFlag)) {
    // Only a change if there was a flag before; otherwise it's just filled in
    if (knownFlag) await record(app, vessel.id, 'flag', vessel.flag ?? flagName(knownFlag), flagName(found.flag), 'ais');
    updates.flag = flagName(found.flag);
  }
  if (found.flag) updates.ais_flag = found.flag;
  if (found.callsign && vessel.callsign && !sameCode(found.callsign, vessel.callsign)) {
    await record(app, vessel.id, 'callsign', vessel.callsign, found.callsign, 'ais');
  }
  if (found.callsign) updates.callsign = found.callsign;
  return updates;
}

/**
 * Compare what AIS reports now with what it reported before, and act on changes.
 * Safe to call on every AIS check; the first call only stores the AIS values.
 */
export async function noteAisIdentity(
  app: App,
  vesselId: string,
  userId: string,
  ais: { name?: string | null; flag?: string | null; callsign?: string | null }
): Promise<void> {
  const [vessel] = await app.db.select().from(schema.vessels).where(eq(schema.vessels.id, vesselId));
  if (!vessel) return;
  const updates: Record<string, any> = {};

  // Flag: a real reflag only when AIS's own flag changes.
  if (ais.flag) {
    if (vessel.ais_flag && !sameCode(ais.flag, vessel.ais_flag)) {
      const was = vessel.flag ?? flagName(vessel.ais_flag);
      const now = flagName(ais.flag);
      await record(app, vessel.id, 'flag', was, now, 'ais');
      updates.flag = now;
      await sendPushToUser(app, userId, {
        title: `${vessel.vessel_name}: flag updated`,
        body: `AIS now shows ${vessel.vessel_name} under the ${now} flag (it was ${was}). Your records keep the old flag for earlier service.`,
        data: { type: 'flag_changed', vesselId },
      });
    }
    if (!sameCode(ais.flag, vessel.ais_flag)) updates.ais_flag = ais.flag;
  }

  // Call sign follows AIS; keep the old one for earlier service.
  if (ais.callsign && vessel.callsign && !sameCode(ais.callsign, vessel.callsign)) {
    await record(app, vessel.id, 'callsign', vessel.callsign, ais.callsign, 'ais');
    updates.callsign = ais.callsign;
  }

  // Name: ask before renaming.
  if (ais.name) {
    const changed = vessel.ais_name && !sameName(ais.name, vessel.ais_name);
    if (changed && !sameName(ais.name, vessel.vessel_name)) {
      updates.pending_name = ais.name;
      updates.pending_name_since = today();
      await sendPushToUser(app, userId, {
        title: `${vessel.vessel_name} has a new name on AIS`,
        body: `AIS now shows it as ${ais.name}. Open SeaTime to rename it in your records.`,
        data: { type: 'name_changed', vesselId },
      });
    }
    if (!sameName(ais.name, vessel.ais_name)) updates.ais_name = ais.name;
  }

  if (Object.keys(updates).length) {
    await app.db.update(schema.vessels).set({ ...updates, updated_at: new Date() }).where(eq(schema.vessels.id, vessel.id));
  }
}

async function ownedVessel(app: App, userId: string, vesselId: string) {
  const [vessel] = await app.db
    .select()
    .from(schema.vessels)
    .where(and(eq(schema.vessels.id, vesselId), eq(schema.vessels.user_id, userId)));
  if (!vessel) throw new VesselIdentityError(404, 'Vessel not found');
  return vessel;
}

/**
 * The user's answer to a suggested rename. `accept` renames from the day AIS first
 * showed the new name (earlier service keeps the old name); `name` lets the user
 * keep their own spelling ("SY Fortuna" for AIS "FORTUNA").
 */
export async function answerPendingName(
  app: App,
  userId: string,
  vesselId: string,
  answer: { accept: boolean; name?: string | null }
): Promise<Vessel> {
  const vessel = await ownedVessel(app, userId, vesselId);
  if (!vessel.pending_name) throw new VesselIdentityError(409, 'No rename is waiting for this vessel');
  const updates: Record<string, any> = { pending_name: null, pending_name_since: null, updated_at: new Date() };
  if (answer.accept) {
    const name = (answer.name ?? '').trim() || vessel.pending_name;
    if (name.length > 100) throw new VesselIdentityError(400, 'Name is too long');
    await record(app, vessel.id, 'vessel_name', vessel.vessel_name, name, 'user', String(vessel.pending_name_since ?? today()));
    updates.vessel_name = name;
  }
  const [updated] = await app.db.update(schema.vessels).set(updates).where(eq(schema.vessels.id, vessel.id)).returning();
  return updated;
}

export async function identityChanges(app: App, vesselIds: string[]) {
  if (!vesselIds.length) return new Map<string, IdentityChange[]>();
  const rows = await app.db
    .select()
    .from(schema.vessel_identity_changes)
    .where(inArray(schema.vessel_identity_changes.vessel_id, vesselIds))
    .orderBy(asc(schema.vessel_identity_changes.effective_date));
  const out = new Map<string, IdentityChange[]>();
  for (const r of rows) {
    const list = out.get(r.vessel_id) ?? [];
    list.push({ field: r.field, old_value: r.old_value, new_value: r.new_value, effective_date: String(r.effective_date), created_at: r.created_at });
    out.set(r.vessel_id, list);
  }
  return out;
}

/**
 * For reports: each entry's vessel as it was on the entry's first day, plus a key
 * for the identity period (so a renamed vessel shows as two blocks).
 */
export async function entriesWithIdentity<E extends { vessel_id: string; start_time: Date | string; vessel?: any }>(
  app: App,
  entries: E[]
): Promise<(E & { identity_period: string })[]> {
  const changes = await identityChanges(app, [...new Set(entries.map((e) => e.vessel_id))]);
  return entries.map((e) => {
    const list = changes.get(e.vessel_id) ?? [];
    const on = new Date(e.start_time).toISOString().slice(0, 10);
    return {
      ...e,
      vessel: e.vessel && list.length ? identityAsOf(e.vessel, list, on) : e.vessel,
      identity_period: list.length ? periodKey(list, on) : 'start',
    };
  });
}
