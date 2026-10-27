import { describe, test, expect } from 'bun:test';
import { planBulkUpdate } from '../src/routes/sea-time-bulk.js';

const U = 'user-1';
const base = { user_id: U, status: 'pending', start_time: new Date('2026-10-01T08:00:00Z'), end_time: new Date('2026-10-01T17:00:00Z'), service_type: 'actual_sea_service', vessel_id: 'v1' };
const seaDays = () => 1;

describe('planBulkUpdate', () => {
  test('confirms a pending entry with duration and sea days', () => {
    const p = planBulkUpdate(base, U, 'confirm', 'watchkeeping_service', seaDays);
    expect(p).toEqual({ update: { end_time: base.end_time, duration_hours: '9', sea_days: 1, status: 'confirmed', service_type: 'watchkeeping_service' } });
  });
  test('keeps the entry service type when none is given', () => {
    const p: any = planBulkUpdate(base, U, 'confirm', undefined, seaDays);
    expect(p.update.service_type).toBe('actual_sea_service');
  });
  test('refuses entries that are not pending, not yours or 0 hours', () => {
    expect(planBulkUpdate({ ...base, status: 'confirmed' }, U, 'confirm', undefined, seaDays)).toEqual({ error: 'Entry is already confirmed' });
    expect(planBulkUpdate({ ...base, user_id: 'other' }, U, 'confirm', undefined, seaDays)).toEqual({ error: 'Sea time entry not found' });
    expect(planBulkUpdate(undefined, U, 'reject', undefined, seaDays)).toEqual({ error: 'Sea time entry not found' });
    expect('error' in planBulkUpdate({ ...base, end_time: base.start_time }, U, 'confirm', undefined, seaDays)).toBe(true);
  });
  test('reject only sets the status', () => {
    expect(planBulkUpdate(base, U, 'reject', undefined, seaDays)).toEqual({ update: { status: 'rejected' } });
  });
});
