import { describe, it, expect } from 'bun:test';
import { formatHoursMinutes, formatEntryNotes } from '../src/utils/duration.js';

describe('formatHoursMinutes', () => {
  it('turns decimal hours into hours and minutes', () => {
    expect(formatHoursMinutes(3.89)).toBe('3h 53m');
    expect(formatHoursMinutes(11.1)).toBe('11h 06m');
    expect(formatHoursMinutes(5)).toBe('5h');
    expect(formatHoursMinutes(0.5)).toBe('30m');
    expect(formatHoursMinutes(1.999)).toBe('2h');
  });
});

describe('formatEntryNotes', () => {
  it('rewrites old live and import notes', () => {
    expect(formatEntryNotes('Movement detected: vessel moved 18.4 nm (0.2731°) over 3.89 hours'))
      .toBe('Movement detected: vessel moved 18.4 nm (0.2731°) over 3h 53m');
    expect(formatEntryNotes('Imported from AIS history: vessel moved 42 nm over 11.1 hours'))
      .toBe('Imported from AIS history: vessel moved 42 nm over 11h 06m');
  });
  it('leaves other text alone', () => {
    expect(formatEntryNotes('Crew change in Palma')).toBe('Crew change in Palma');
    expect(formatEntryNotes(null)).toBe('');
  });
});

describe('formatEntryNotes leaves crew notes alone', () => {
  it('only rewrites app-written notes', () => {
    expect(formatEntryNotes('Engine watch over 12 hours')).toBe('Engine watch over 12 hours');
  });
});
