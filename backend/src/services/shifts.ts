/**
 * Database side of manual shifts (see utils/shifts.ts for the rules).
 *
 * Shift mode: a commercial user who clocks in has their shifts as their record.
 * The vessel may run 24 hours with other crews, so AIS passages are not logged
 * to them while in shift mode; otherwise confirming an AIS passage would put the
 * vessel's whole day back on top of their shift hours.
 */

import { eq, and, gte, inArray, isNull, isNotNull, like, or, asc } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { calculateDurationHours, calculateSeaDays } from '../utils/seaTime.js';
import { MANUAL_SHIFT_NOTE_PREFIX, SHIFT_MODE_WINDOW_DAYS, coveredByShift, isShiftNote } from '../utils/shifts.js';

const DAY_MS = 86_400_000;

/** Whether AIS passages should be held back for this user because they log shifts. */
export async function isInShiftMode(app: App, userId: string, vesselSector: string | null | undefined): Promise<boolean> {
  if (vesselSector !== 'commercial') return false;
  const since = new Date(Date.now() - SHIFT_MODE_WINDOW_DAYS * DAY_MS);
  const [row] = await app.db
    .select({ id: schema.sea_time_entries.id })
    .from(schema.sea_time_entries)
    .where(
      and(
        eq(schema.sea_time_entries.user_id, userId),
        gte(schema.sea_time_entries.start_time, since),
        or(
          eq(schema.sea_time_entries.status, 'active'),
          like(schema.sea_time_entries.notes, `${MANUAL_SHIFT_NOTE_PREFIX}%`)
        )
      )
    )
    .limit(1);
  return !!row;
}

/** The user's open shift, earliest first if a race ever left two. */
export async function findOpenShift(app: App, userId: string) {
  const [active] = await app.db
    .select()
    .from(schema.sea_time_entries)
    .where(and(eq(schema.sea_time_entries.user_id, userId), eq(schema.sea_time_entries.status, 'active')))
    .orderBy(asc(schema.sea_time_entries.start_time), asc(schema.sea_time_entries.created_at))
    .limit(1);
  return active ?? null;
}

/**
 * Keep one open shift per user. The partial unique index
 * (manual-migrations/2026-10-28_one_open_shift_per_user.sql) enforces this once
 * applied; until then a double clock-in can insert two rows, so the later ones
 * are removed here. Returns the shift that was kept.
 */
export async function dedupeOpenShifts(app: App, userId: string) {
  const open = await app.db
    .select()
    .from(schema.sea_time_entries)
    .where(and(eq(schema.sea_time_entries.user_id, userId), eq(schema.sea_time_entries.status, 'active')))
    .orderBy(asc(schema.sea_time_entries.start_time), asc(schema.sea_time_entries.created_at));
  if (open.length > 1) {
    const dupeIds = open.slice(1).map((e) => e.id);
    await app.db.delete(schema.sea_time_entries).where(inArray(schema.sea_time_entries.id, dupeIds));
    app.logger.warn({ userId, kept: open[0].id, deleted: dupeIds }, 'Removed duplicate open shifts');
  }
  return open[0] ?? null;
}

/**
 * At clock-in, end any AIS passage still open for the user at the clock-in time.
 * From here the shift is the record, and shift mode stops the passage being
 * closed later by AIS.
 */
export async function closeOpenAisPassages(app: App, userId: string, at: Date): Promise<number> {
  const open = await app.db
    .select()
    .from(schema.sea_time_entries)
    .where(
      and(
        eq(schema.sea_time_entries.user_id, userId),
        isNotNull(schema.sea_time_entries.start_time),
        isNull(schema.sea_time_entries.end_time),
        inArray(schema.sea_time_entries.status, ['pending', 'off_board'])
      )
    );
  let closed = 0;
  for (const e of open) {
    if (isShiftNote(e.notes)) continue;
    const end = e.start_time.getTime() < at.getTime() ? at : e.start_time;
    const duration = calculateDurationHours(e.start_time, end);
    await app.db
      .update(schema.sea_time_entries)
      .set({
        end_time: end,
        duration_hours: String(duration),
        sea_days: calculateSeaDays(e.start_time, end),
        mca_compliant: duration >= 4,
      })
      .where(eq(schema.sea_time_entries.id, e.id));
    closed++;
  }
  if (closed > 0) app.logger.info({ userId, closed }, 'Closed open AIS passages at shift clock-in');
  return closed;
}

/**
 * At clock-out, reject unconfirmed AIS passages that lie wholly inside the shift:
 * the shift already records that time, and confirming both would show the same
 * hours twice in the logbook. Passages that only partly overlap are left for the
 * user to decide.
 */
export async function rejectAisPassagesCoveredByShift(app: App, userId: string, shiftStart: Date, shiftEnd: Date): Promise<number> {
  const pending = await app.db
    .select()
    .from(schema.sea_time_entries)
    .where(
      and(
        eq(schema.sea_time_entries.user_id, userId),
        eq(schema.sea_time_entries.status, 'pending'),
        gte(schema.sea_time_entries.start_time, shiftStart)
      )
    );
  const ids = pending
    .filter((e) => !isShiftNote(e.notes) && coveredByShift(e, shiftStart, shiftEnd))
    .map((e) => e.id);
  if (ids.length === 0) return 0;
  await app.db
    .update(schema.sea_time_entries)
    .set({ status: 'rejected', notes: 'Covered by your manual shift' })
    .where(inArray(schema.sea_time_entries.id, ids));
  app.logger.info({ userId, rejected: ids }, 'Rejected AIS passages covered by a manual shift');
  return ids.length;
}
