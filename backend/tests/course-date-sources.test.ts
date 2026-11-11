import { describe, it, expect } from 'bun:test';
import { COURSE_DATE_SOURCES } from '../src/data/course-date-sources.js';
import { TRAINING_PROVIDERS_JSON } from '../src/data/training-providers.js';

describe('course date sources', () => {
  const ids = new Set((JSON.parse(TRAINING_PROVIDERS_JSON).providers as { id: string }[]).map((p) => p.id));
  it('are one per provider, for providers in the directory', () => {
    const seen = new Set<string>();
    for (const s of COURSE_DATE_SOURCES) {
      expect(ids.has(s.provider_id)).toBe(true);
      expect(seen.has(s.provider_id)).toBe(false);
      seen.add(s.provider_id);
      expect(s.dates_url).toMatch(/^https?:\/\//);
    }
  });
  it('have a known parser and, for html, row patterns that compile', () => {
    for (const s of COURSE_DATE_SOURCES) {
      expect(['jsonld', 'ics', 'tribe', 'html']).toContain(s.parser);
      if (s.parser !== 'html') continue;
      const c = s.config as Record<string, string>;
      expect(typeof c.block).toBe('string');
      for (const k of ['block', 'title', 'date', 'venue', 'skip']) if (c[k]) expect(() => new RegExp(c[k], 'i')).not.toThrow();
    }
  });
});
