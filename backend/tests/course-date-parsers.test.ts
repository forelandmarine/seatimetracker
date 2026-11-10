import { describe, it, expect } from 'bun:test';
import { matchCourseCode } from '../src/utils/courseMatch.js';
import { firstDateSpan, parseHtml, parseIcs, parseTribe, tribeNextPage, priceInText, availabilityInText, htmlText } from '../src/services/courseDateParsers.js';

describe('firstDateSpan', () => {
  it('reads day-month-year dates and ranges', () => {
    expect(firstDateSpan('Starts 12 January 2099')).toEqual({ start: '2099-01-12', end: null });
    expect(firstDateSpan('Mon 12th Jan 2099')).toEqual({ start: '2099-01-12', end: null });
    expect(firstDateSpan('12 - 15 Jan 2099')).toEqual({ start: '2099-01-12', end: '2099-01-15' });
    expect(firstDateSpan('30 Jan - 2 Feb 2099')).toEqual({ start: '2099-01-30', end: '2099-02-02' });
    expect(firstDateSpan('30 Dec - 2 Jan 2099')).toEqual({ start: '2098-12-30', end: '2099-01-02' });
    expect(firstDateSpan('12 Jan 2099 to 15 Jan 2099')).toEqual({ start: '2099-01-12', end: '2099-01-15' });
  });
  it('reads month-first dates', () => {
    expect(firstDateSpan('January 12, 2099')).toEqual({ start: '2099-01-12', end: null });
    expect(firstDateSpan('Jan 12-15, 2099')).toEqual({ start: '2099-01-12', end: '2099-01-15' });
    expect(firstDateSpan('Jan 30 - Feb 2, 2099')).toEqual({ start: '2099-01-30', end: '2099-02-02' });
  });
  it('reads numeric dates in the configured order', () => {
    expect(firstDateSpan('12/01/2099')).toEqual({ start: '2099-01-12', end: null });
    expect(firstDateSpan('12/01/2099', 'mdy')).toEqual({ start: '2099-12-01', end: null });
    expect(firstDateSpan('12.01.2099 - 15.01.2099')).toEqual({ start: '2099-01-12', end: '2099-01-15' });
    expect(firstDateSpan('2099-01-12')).toEqual({ start: '2099-01-12', end: null });
  });
  it('takes the first date in the text and ignores dates without a year', () => {
    expect(firstDateSpan('3 Feb 2099 then 1 Jan 2099')?.start).toBe('2099-02-03');
    expect(firstDateSpan('Next course 12 Jan')).toBeNull();
    expect(firstDateSpan('31/02/2099')).toBeNull();
  });
});

describe('text helpers', () => {
  it('finds prices and availability', () => {
    expect(priceInText('Price: £1,195.00 inc VAT')).toBe('£1,195');
    expect(priceInText('Cost 850 EUR')).toBe('€850');
    expect(priceInText('Call us')).toBeNull();
    expect(availabilityInText('FULLY BOOKED')).toBe('Full');
    expect(availabilityInText('Only 2 places left')).toBe('Few places left');
    expect(availabilityInText('Places available')).toBe('Available');
    expect(availabilityInText('PSCRB')).toBeNull();
  });
  it('turns html into text', () => {
    expect(htmlText('<td>STCW&nbsp;PST</td><td>12&ndash;15 Jan</td>')).toBe('STCW PST\n12-15 Jan');
  });
});

describe('parseIcs', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:STCW Personal Survival Techniques',
    'DTSTART;VALUE=DATE:20990112',
    'DTEND;VALUE=DATE:20990114',
    'URL:https://example.com/pst',
    'DESCRIPTION:Price £295',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:PSCRB \\, Survival Craft',
    'DTSTART;TZID=Europe/London:20990120T090000',
    'DTEND;TZID=Europe/London:20990123T170000',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Christmas party',
    'DTSTART;VALUE=DATE:20991220',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Advanced Fire Fighting',
    'DTSTART;VALUE=DATE:20990201',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Advanced Fire Fighting',
    'DTSTART;VALUE=DATE:20010201',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  it('reads mapped VEVENTs, treats all-day DTEND as exclusive, skips cancelled and past', () => {
    const d = parseIcs(ics, 'https://example.com/feed.ics');
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ course_code: 'pst', start_date: '2099-01-12', end_date: '2099-01-13', price_text: '£295', booking_url: 'https://example.com/pst' });
    expect(d[1]).toMatchObject({ course_code: 'pscrb', start_date: '2099-01-20', end_date: '2099-01-23' });
  });
  it('unfolds long lines', () => {
    const folded = 'BEGIN:VEVENT\r\nSUMMARY:STCW Elementary\r\n  First Aid\r\nDTSTART:20990301T080000Z\r\nEND:VEVENT';
    expect(parseIcs(folded, 'https://x.test/f.ics')[0]).toMatchObject({ course_code: 'efa', start_date: '2099-03-01' });
  });
});

describe('parseTribe', () => {
  const body = JSON.stringify({
    events: [
      { title: 'STCW Fire Prevention &amp; Fire Fighting', start_date: '2099-04-07 09:00:00', end_date: '2099-04-08 17:00:00', url: 'https://example.com/event/fpff/', cost: '£450', cost_details: { currency_code: 'GBP', values: ['450'] } },
      { title: 'Open day', start_date: '2099-04-09 09:00:00' },
      { title: 'Refresher week', categories: [{ name: 'PSCRB Refresher' }], start_date: '2099-04-10 09:00:00' },
    ],
    next_rest_url: 'https://example.com/wp-json/tribe/events/v1/events?page=2',
  });
  it('maps titles (or categories) and prices', () => {
    const d = parseTribe(body, 'https://example.com/wp-json/tribe/events/v1/events');
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ course_code: 'fpff', start_date: '2099-04-07', end_date: '2099-04-08', price_text: '£450', booking_url: 'https://example.com/event/fpff/' });
    expect(d[1]).toMatchObject({ course_code: 'pscrb_refresher', start_date: '2099-04-10' });
    expect(tribeNextPage(body)).toBe('https://example.com/wp-json/tribe/events/v1/events?page=2');
  });
  it('survives bad JSON', () => {
    expect(parseTribe('<html>', 'https://example.com')).toEqual([]);
    expect(tribeNextPage('<html>')).toBeNull();
  });
});

describe('parseHtml', () => {
  const page = `<table>
    <tr><th>Course</th><th>Dates</th></tr>
    <tr><td>STCW PSSR</td><td>12 Jan 2099</td><td>£180</td><td><a href="/book?id=1">Book</a></td></tr>
    <tr><td>Medical First Aid</td><td>19 - 23 Jan 2099</td><td>Fully booked</td></tr>
    <tr><td>Team building</td><td>2 Feb 2099</td></tr>
    <tr><td>PST</td><td>TBC</td></tr>
  </table>`;
  it('reads one date per row that has a course and a dated start', () => {
    const d = parseHtml(page, 'https://example.com/dates', { block: '<tr\\b' });
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ course_code: 'pssr', start_date: '2099-01-12', price_text: '£180', booking_url: 'https://example.com/book?id=1' });
    expect(d[1]).toMatchObject({ course_code: 'mfa', start_date: '2099-01-19', end_date: '2099-01-23', availability_text: 'Full' });
  });
  it('honours a fixed course, a title pattern and a venue filter', () => {
    const one = '<li>Mon 3 May 2099 Southampton</li><li>Tue 4 May 2099 Glasgow</li>';
    expect(parseHtml(one, 'https://x.test', { block: '<li\\b', course: 'efa', venue: 'Southampton' })).toEqual([
      expect.objectContaining({ course_code: 'efa', start_date: '2099-05-03' }),
    ]);
    const titled = '<div class="ev">Venue: PST House | Course: Advanced Fire Fighting | 9 Jun 2099</div>';
    expect(parseHtml(titled, 'https://x.test', { block: '<div class="ev"', title: 'Course: ([^|]+)' })[0].course_code).toBe('aff');
  });
});

describe('matchCourseCode 2.5.0 additions', () => {
  it('reads "Updated proficiency in ..." as the matching refresher', () => {
    expect(matchCourseCode('Updated Proficiency In Fire Prevention And Fire Fighting And Personal Survival Techniques')).toBe('stcw_basic_refresher');
    expect(matchCourseCode('Updated Proficiency In Advanced Fire Fighting')).toBe('aff_refresher');
    expect(matchCourseCode('Updated Proficiency In Medical Care')).toBe('medical_care_refresher');
    expect(matchCourseCode('Updated Proficiency In Survival Craft And Rescue Boats Other Than Fast Rescue Boats')).toBe('pscrb_refresher');
  });
  it('keeps restricted PSCRB unmapped and reads HELM levels', () => {
    expect(matchCourseCode('Proficiency In Survival Craft And Rescue Boats Other Than Fast Rescue Boats (Restricted)')).toBeNull();
    expect(matchCourseCode('HUMAN ELEMENT LEADERSHIP & MANAGEMENT (Management Level) - HELM (M)')).toBe('helm_mgmt');
    expect(matchCourseCode('HUMAN ELEMENT LEADERSHIP & MANAGEMENT (Operational Level) - HELM (O)')).toBe('helm_op');
    expect(matchCourseCode('Proficiency in Survival Craft and Rescue Boats')).toBe('pscrb');
  });
});

describe('parseHtml title and date patterns', () => {
  it('reads the title from raw HTML and the date from a labelled cell', () => {
    const card = `<article class="course-index-item"><button aria-label="Compare toggle for the GMDSS Restricted Operator Certificate (ROC) course">x</button>
      <p>For mariners in Area A1 (VHF range). Updated 1 Jan 2099.</p><h3>Starts</h3><p>15 Dec 2099</p></article>
      <article class="course-index-item"><button aria-label="Compare toggle for the HNC Nautical Science course">x</button><h3>Starts</h3><p>1 Sep 2099</p></article>`;
    const d = parseHtml(card, 'https://x.test', { block: '<article class="course-index-item"', title: 'aria-label="Compare toggle for the ([^"]+) course"', titleHtml: true, date: 'Starts \\| ([^|]+)' });
    expect(d).toEqual([expect.objectContaining({ course_code: 'gmdss_roc', start_date: '2099-12-15' })]);
  });
});
