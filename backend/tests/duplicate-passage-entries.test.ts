import { describe, test, expect } from 'bun:test';
import { latestEntryOnDay, overlappingPredecessor } from '../src/utils/voyageState.js';
import { getCalendarDay } from '../src/utils/seaTime.js';

const t = (iso: string) => new Date(iso);

describe('latestEntryOnDay', () => {
  // Sealion, 13 Nov 2026: passage A ended alongside in Gibraltar, passage B began at 16:42.
  const A = { id: 'A', start_time: t('2026-11-13T03:08:32Z'), end_time: t('2026-11-13T10:41:48Z') };
  const B = { id: 'B', start_time: t('2026-11-13T16:42:51Z'), end_time: t('2026-11-13T22:43:01Z') };

  test('picks the entry that ends latest, whatever the row order', () => {
    expect(latestEntryOnDay([A, B], '2026-11-13', getCalendarDay)?.id).toBe('B');
    expect(latestEntryOnDay([B, A], '2026-11-13', getCalendarDay)?.id).toBe('B');
  });

  test('ignores entries that start on another day', () => {
    expect(latestEntryOnDay([A, B], '2026-11-14', getCalendarDay)).toBeUndefined();
  });
});

describe('overlappingPredecessor', () => {
  test('MSC Eva: the next day starts where the previous entry ended', () => {
    const prev = { id: 'P', start_time: t('2026-11-11T03:40:00Z'), end_time: t('2026-11-12T06:39:58Z') };
    const r = overlappingPredecessor([prev], t('2026-11-12T05:06:55Z'), t('2026-11-12T07:10:59Z'));
    expect(r).toBe(prev);
  });

  test('window wholly inside an existing entry adds nothing', () => {
    const prev = { id: 'P', start_time: t('2026-11-13T16:42:51Z'), end_time: t('2026-11-13T23:14:05Z') };
    expect(overlappingPredecessor([prev], t('2026-11-13T16:42:51Z'), t('2026-11-13T23:14:05Z'))).toBe('covered');
  });

  test('no overlap when the previous entry ended before the window', () => {
    const prev = { id: 'P', start_time: t('2026-11-13T03:08:32Z'), end_time: t('2026-11-13T10:41:48Z') };
    expect(overlappingPredecessor([prev], t('2026-11-13T16:42:51Z'), t('2026-11-13T22:43:01Z'))).toBeNull();
  });

  test('an entry that only touches the window start does not count', () => {
    const prev = { id: 'P', start_time: t('2026-11-13T10:00:00Z'), end_time: t('2026-11-13T16:42:51Z') };
    expect(overlappingPredecessor([prev], t('2026-11-13T16:42:51Z'), t('2026-11-13T18:00:00Z'))).toBeNull();
  });

  test('an entry starting inside the window is left alone', () => {
    const manual = { id: 'M', start_time: t('2026-11-13T17:00:00Z'), end_time: t('2026-11-13T17:30:00Z') };
    expect(overlappingPredecessor([manual], t('2026-11-13T16:42:51Z'), t('2026-11-13T18:00:00Z'))).toBeNull();
  });

  test('uses the overlapping entry that ends latest', () => {
    const a = { id: 'a', start_time: t('2026-11-13T00:00:00Z'), end_time: t('2026-11-14T00:30:00Z') };
    const b = { id: 'b', start_time: t('2026-11-13T12:00:00Z'), end_time: t('2026-11-14T01:49:00Z') };
    expect((overlappingPredecessor([a, b], t('2026-11-14T00:16:03Z'), t('2026-11-14T02:20:07Z')) as any).id).toBe('b');
  });
});
