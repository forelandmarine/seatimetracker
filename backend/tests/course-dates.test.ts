import { describe, it, expect } from 'bun:test';
import { parseJsonLd } from '../src/services/courseDates.js';
import { matchCourseCode } from '../src/utils/courseMatch.js';

describe('matchCourseCode', () => {
  it('maps common course titles', () => {
    expect(matchCourseCode('STCW Proficiency in Survival Craft and Rescue Boats (PSCRB)')).toBe('pscrb');
    expect(matchCourseCode('PSCRB Refresher')).toBe('pscrb_refresher');
    expect(matchCourseCode('STCW Basic Safety Training Refresher')).toBe('stcw_basic_refresher');
    expect(matchCourseCode('Advanced Fire Fighting')).toBe('aff');
    expect(matchCourseCode('HELM (Management)')).toBe('helm_mgmt');
    expect(matchCourseCode('GMDSS GOC')).toBe('gmdss_goc');
    expect(matchCourseCode('RYA Yachtmaster Offshore Shorebased')).toBe('ym_offshore_sb');
    expect(matchCourseCode('GWO Basic Safety Training')).toBe('gwo_bst');
    expect(matchCourseCode('Wine tasting')).toBeNull();
  });
});

describe('parseJsonLd', () => {
  it('reads Event and CourseInstance blocks and drops past dates', () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify([
      { '@type': 'Event', name: 'PSCRB', startDate: '2099-11-17T09:00', endDate: '2099-11-20', url: '/book/1',
        offers: { price: '895', priceCurrency: 'GBP', availability: 'https://schema.org/LimitedAvailability' } },
      { '@type': 'Event', name: 'PSCRB', startDate: '2001-01-01' },
      { '@type': 'Course', name: 'Advanced Fire Fighting', hasCourseInstance: [{ '@type': 'CourseInstance', startDate: '2099-12-08' }] },
    ])}</script></html>`;
    const d = parseJsonLd(html, 'https://example.com/courses');
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ course_code: 'pscrb', start_date: '2099-11-17', end_date: '2099-11-20', price_text: '£895', availability_text: 'Few places left', booking_url: 'https://example.com/book/1' });
    expect(d[1]).toMatchObject({ course_code: 'aff', start_date: '2099-12-08' });
  });
});

describe('matchCourseCode refreshers', () => {
  it('keeps specific refreshers apart from the basic one', () => {
    expect(matchCourseCode('STCW Advanced Fire Fighting Refresher')).toBe('aff_refresher');
    expect(matchCourseCode('STCW PSCRB Refresher')).toBe('pscrb_refresher');
    expect(matchCourseCode('STCW Medical Care Refresher')).toBe('medical_care_refresher');
    expect(matchCourseCode('STCW Basic Training Refresher')).toBe('stcw_basic_refresher');
  });
});
