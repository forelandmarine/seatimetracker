import { describe, test, expect } from 'bun:test';
import { samsaCreditableDays, entrySeaDays } from '../src/utils/seaTime.js';

const e = (start: string, end: string, service_type = 'actual_sea_service', extra: any = {}) => ({
  start_time: start, end_time: end, service_type, ...extra,
});

describe('samsaCreditableDays', () => {
  const now = new Date('2026-10-27T00:00:00Z');
  test('any time on a date counts, port days included', () => {
    const r = samsaCreditableDays([
      e('2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z'), // 1 hour still a day
      e('2026-10-02T22:00:00Z', '2026-10-03T02:00:00Z'), // touches two dates
      e('2026-10-05T08:00:00Z', '2026-10-05T18:00:00Z', 'service_in_port'),
    ], now);
    expect(r.seagoing).toBe(4);
    expect(r.standby_yard).toBe(0);
  });
  test('stand-by and yard reported apart; old service outside the window', () => {
    const r = samsaCreditableDays([
      e('2026-09-01T08:00:00Z', '2026-09-01T16:00:00Z', 'yard_service'),
      e('2026-09-02T08:00:00Z', '2026-09-02T16:00:00Z', 'standby_service'),
      e('2010-01-01T08:00:00Z', '2010-01-01T16:00:00Z'),
    ], now);
    expect(r.standby_yard).toBe(2);
    expect(r.seagoing).toBe(0);
    expect(r.outside_window).toBe(1);
  });
  test('watchkeeping at 8 hours to the day', () => {
    const r = samsaCreditableDays([e('2026-10-10T00:00:00Z', '2026-10-12T00:00:00Z', 'watchkeeping_service', { watchkeeping_hours: 17 })], now);
    expect(r.watchkeeping).toBe(2);
  });
  test('entrySeaDays uses the SAMSA rule', () => {
    expect(entrySeaDays(e('2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z') as any, 'samsa', now)).toBe(1);
    expect(entrySeaDays(e('2026-10-01T10:00:00Z', '2026-10-01T11:00:00Z') as any, 'mca', now)).toBe(0);
  });
});

describe('SAMSA per-entry dates are claimed once', () => {
  test('six entries on one date store 1 day in total', () => {
    const claimed = new Set<string>();
    let sum = 0;
    for (let h = 6; h < 18; h += 2) sum += entrySeaDays(e(`2026-10-01T${String(h).padStart(2, '0')}:00:00Z`, `2026-10-01T${String(h + 2).padStart(2, '0')}:00:00Z`) as any, 'samsa', new Date('2026-10-27T00:00:00Z'), claimed);
    expect(sum).toBe(1);
  });
});
