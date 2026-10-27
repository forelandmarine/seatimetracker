/**
 * Manual shift clock-in / clock-out rules (commercial / CTV crews).
 *
 * Pure helpers, kept apart from the routes so they can be unit-tested. The
 * database side lives in services/shifts.ts.
 *
 * An open shift is a sea_time_entry with status 'active' and end_time null.
 * Shift entries are recognised by their notes, which always start with
 * MANUAL_SHIFT_NOTE_PREFIX (no column marks them, so no migration is needed).
 */

/**
 * Longest shift that can be logged. A shift left open longer than this (a
 * forgotten clock-out) is not closed at "now": the user must say when it ended.
 * An open shift never counts towards sea time, so nothing is invented while it
 * waits.
 */
export const MAX_SHIFT_HOURS = 16;

/**
 * A commercial user who has clocked in within this many days is in shift mode:
 * their shifts are their record, so AIS passages are not logged to them.
 */
export const SHIFT_MODE_WINDOW_DAYS = 30;

export const MANUAL_SHIFT_NOTE_PREFIX = 'Manual shift';

const HOUR_MS = 3_600_000;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isShiftNote(notes: string | null | undefined): boolean {
  return typeof notes === 'string' && notes.startsWith(MANUAL_SHIFT_NOTE_PREFIX);
}

/** `end` is set when ok; otherwise `code` and `error` say why not. */
export interface ShiftEndResult {
  ok: boolean;
  end?: Date;
  code?: 'needs_end_time' | 'invalid_end_time';
  error?: string;
}

/**
 * Decide when a shift ends. With no end time from the user it ends now, unless
 * that makes it longer than MAX_SHIFT_HOURS, in which case the user must say
 * when it ended. A user-supplied end must fall after the start, not in the
 * future, and within MAX_SHIFT_HOURS of the start.
 */
export function resolveShiftEnd(start: Date, requested: string | null | undefined, now: Date = new Date()): ShiftEndResult {
  const maxEnd = start.getTime() + MAX_SHIFT_HOURS * HOUR_MS;
  if (requested == null || requested === '') {
    if (now.getTime() > maxEnd) {
      return {
        ok: false,
        code: 'needs_end_time',
        error: `This shift has been open for more than ${MAX_SHIFT_HOURS} hours. Please choose when it ended.`,
      };
    }
    return { ok: true, end: now };
  }
  const end = new Date(requested);
  if (isNaN(end.getTime())) {
    return { ok: false, code: 'invalid_end_time', error: 'end_time must be an ISO date-time' };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, code: 'invalid_end_time', error: 'The shift must end after it started.' };
  }
  // A minute of slack for clock drift between the phone and the server.
  if (end.getTime() > now.getTime() + 60_000) {
    return { ok: false, code: 'invalid_end_time', error: 'The shift cannot end in the future.' };
  }
  if (end.getTime() > maxEnd) {
    return {
      ok: false,
      code: 'invalid_end_time',
      error: `A shift can be at most ${MAX_SHIFT_HOURS} hours long.`,
    };
  }
  return { ok: true, end: end.getTime() > now.getTime() ? now : end };
}

/** Whether an entry lies wholly inside a shift, so the shift already records it. */
export function coveredByShift(
  entry: { start_time: Date; end_time: Date | null },
  shiftStart: Date,
  shiftEnd: Date
): boolean {
  return entry.end_time != null
    && entry.start_time.getTime() >= shiftStart.getTime()
    && entry.end_time.getTime() <= shiftEnd.getTime();
}
