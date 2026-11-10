import { describe, it, expect } from 'bun:test';
import { matchCourseCode } from '../src/utils/courseMatch.js';
import { firstDateSpan, parseHtml, parseIcs, parseTribe, tribeNextPage, priceInText, availabilityInText, htmlText } from '../src/services/courseDateParsers.js';

// Next year: parsers drop past dates and anything over two years out.
const Y = new Date().getUTCFullYear() + 1;
const Y0 = Y - 1;

describe('firstDateSpan', () => {
  it('reads day-month-year dates and ranges', () => {
    expect(firstDateSpan(`Starts 12 January ${Y}`)).toEqual({ start: `${Y}-01-12`, end: null });
    expect(firstDateSpan(`Mon 12th Jan ${Y}`)).toEqual({ start: `${Y}-01-12`, end: null });
    expect(firstDateSpan(`12 - 15 Jan ${Y}`)).toEqual({ start: `${Y}-01-12`, end: `${Y}-01-15` });
    expect(firstDateSpan(`30 Jan - 2 Feb ${Y}`)).toEqual({ start: `${Y}-01-30`, end: `${Y}-02-02` });
    expect(firstDateSpan(`30 Dec - 2 Jan ${Y}`)).toEqual({ start: `${Y0}-12-30`, end: `${Y}-01-02` });
    expect(firstDateSpan(`12 Jan ${Y} to 15 Jan ${Y}`)).toEqual({ start: `${Y}-01-12`, end: `${Y}-01-15` });
  });
  it('reads month-first dates', () => {
    expect(firstDateSpan(`January 12, ${Y}`)).toEqual({ start: `${Y}-01-12`, end: null });
    expect(firstDateSpan(`Jan 12-15, ${Y}`)).toEqual({ start: `${Y}-01-12`, end: `${Y}-01-15` });
    expect(firstDateSpan(`Jan 30 - Feb 2, ${Y}`)).toEqual({ start: `${Y}-01-30`, end: `${Y}-02-02` });
  });
  it('reads numeric dates in the configured order', () => {
    expect(firstDateSpan(`12/01/${Y}`)).toEqual({ start: `${Y}-01-12`, end: null });
    expect(firstDateSpan(`12/01/${Y}`, 'mdy')).toEqual({ start: `${Y}-12-01`, end: null });
    expect(firstDateSpan(`12.01.${Y} - 15.01.${Y}`)).toEqual({ start: `${Y}-01-12`, end: `${Y}-01-15` });
    expect(firstDateSpan(`${Y}-01-12`)).toEqual({ start: `${Y}-01-12`, end: null });
  });
  it('takes the first date in the text and ignores dates without a year', () => {
    expect(firstDateSpan(`3 Feb ${Y} then 1 Jan ${Y}`)?.start).toBe(`${Y}-02-03`);
    expect(firstDateSpan('Next course 12 Jan')).toBeNull();
    expect(firstDateSpan(`31/02/${Y}`)).toBeNull();
  });
});

describe('text helpers', () => {
  it('finds prices and availability', () => {
    expect(priceInText('Price: £1,195.00 inc VAT')).toBe('£1,195');
    expect(priceInText('Cost 850 EUR')).toBe('€850');
    expect(priceInText('Call us')).toBeNull();
    expect(priceInText('&euro; 1.049,00 3 spots')).toBeNull();
    expect(priceInText('€ 1.049,00 3 spots')).toBe('€1,049');
    expect(priceInText('€ 806,50')).toBe('€806.5');
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
    `DTSTART;VALUE=DATE:${Y}0112`,
    `DTEND;VALUE=DATE:${Y}0114`,
    'URL:https://example.com/pst',
    'DESCRIPTION:Price £295',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:PSCRB \\, Survival Craft',
    `DTSTART;TZID=Europe/London:${Y}0120T090000`,
    `DTEND;TZID=Europe/London:${Y}0123T170000`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Christmas party',
    `DTSTART;VALUE=DATE:${Y}1220`,
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:Advanced Fire Fighting',
    `DTSTART;VALUE=DATE:${Y}0201`,
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
    expect(d[0]).toMatchObject({ course_code: 'pst', start_date: `${Y}-01-12`, end_date: `${Y}-01-13`, price_text: '£295', booking_url: 'https://example.com/pst' });
    expect(d[1]).toMatchObject({ course_code: 'pscrb', start_date: `${Y}-01-20`, end_date: `${Y}-01-23` });
  });
  it('unfolds long lines', () => {
    const folded = `BEGIN:VEVENT\r\nSUMMARY:STCW Elementary\r\n  First Aid\r\nDTSTART:${Y}0301T080000Z\r\nEND:VEVENT`;
    expect(parseIcs(folded, 'https://x.test/f.ics')[0]).toMatchObject({ course_code: 'efa', start_date: `${Y}-03-01` });
  });
});

describe('parseTribe', () => {
  const body = JSON.stringify({
    events: [
      { title: 'STCW Fire Prevention &amp; Fire Fighting', start_date: `${Y}-04-07 09:00:00`, end_date: `${Y}-04-08 17:00:00`, url: 'https://example.com/event/fpff/', cost: '£450', cost_details: { currency_code: 'GBP', values: ['450'] } },
      { title: 'Open day', start_date: `${Y}-04-09 09:00:00` },
      { title: 'Refresher week', categories: [{ name: 'PSCRB Refresher' }], start_date: `${Y}-04-10 09:00:00` },
    ],
    next_rest_url: 'https://example.com/wp-json/tribe/events/v1/events?page=2',
  });
  it('maps titles (or categories) and prices', () => {
    const d = parseTribe(body, 'https://example.com/wp-json/tribe/events/v1/events');
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ course_code: 'fpff', start_date: `${Y}-04-07`, end_date: `${Y}-04-08`, price_text: '£450', booking_url: 'https://example.com/event/fpff/' });
    expect(d[1]).toMatchObject({ course_code: 'pscrb_refresher', start_date: `${Y}-04-10` });
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
    <tr><td>STCW PSSR</td><td>12 Jan ${Y}</td><td>£180</td><td><a href="/book?id=1">Book</a></td></tr>
    <tr><td>Medical First Aid</td><td>19 - 23 Jan ${Y}</td><td>Fully booked</td></tr>
    <tr><td>Team building</td><td>2 Feb ${Y}</td></tr>
    <tr><td>PST</td><td>TBC</td></tr>
  </table>`;
  it('reads one date per row that has a course and a dated start', () => {
    const d = parseHtml(page, 'https://example.com/dates', { block: '<tr\\b' });
    expect(d).toHaveLength(2);
    expect(d[0]).toMatchObject({ course_code: 'pssr', start_date: `${Y}-01-12`, price_text: '£180', booking_url: 'https://example.com/book?id=1' });
    expect(d[1]).toMatchObject({ course_code: 'mfa', start_date: `${Y}-01-19`, end_date: `${Y}-01-23`, availability_text: 'Full' });
  });
  it('honours a fixed course, a title pattern and a venue filter', () => {
    const one = `<li>Mon 3 May ${Y} Southampton</li><li>Tue 4 May ${Y} Glasgow</li>`;
    expect(parseHtml(one, 'https://x.test', { block: '<li\\b', course: 'efa', venue: 'Southampton' })).toEqual([
      expect.objectContaining({ course_code: 'efa', start_date: `${Y}-05-03` }),
    ]);
    const titled = `<div class="ev">Venue: PST House | Course: Advanced Fire Fighting | 9 Jun ${Y}</div>`;
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
  it('maps only GWO Basic Safety to gwo_bst', () => {
    expect(matchCourseCode('GWO Basic Safety Training (BST)')).toBe('gwo_bst');
    expect(matchCourseCode('GWO BST Full')).toBe('gwo_bst');
    expect(matchCourseCode('GWO Sea Survival')).toBe('gwo_sea_survival');
    expect(matchCourseCode('GWO ADVANCED RESCUE(ART)')).toBeNull();
    expect(matchCourseCode('GWO BASIC TECHNICAL TRAINING(BTT)')).toBeNull();
    expect(matchCourseCode('GWO ENHANCED FIRST AID')).toBeNull();
  });
  it('reads US revalidation titles and keeps small-ship nav apart', () => {
    expect(matchCourseCode('Advance Firefighting REVALIDATION (JAX)')).toBe('aff_refresher');
    expect(matchCourseCode('Basic Training REVALIDATION (JAX)')).toBe('stcw_basic_refresher');
    expect(matchCourseCode('Advance Firefighting (AFF) (JAX)')).toBe('aff');
    expect(matchCourseCode('Small Ships Navigation & Radar')).toBeNull();
    expect(matchCourseCode('Navigation & Radar (OOW) Yacht')).toBe('oow_yachts_nav_radar');
  });
  it('leaves skipper refreshers and mile builders unmapped', () => {
    expect(matchCourseCode('5 DAY SKIPPER REFRESHER COURSE')).toBeNull();
    expect(matchCourseCode('Coastal Skipper Mile Builder')).toBeNull();
    expect(matchCourseCode('RYA Day Skipper Practical')).toBe('day_skipper');
  });
});

describe('placeholder dates', () => {
  it('drops rows dated years ahead', () => {
    const far = Y + 70;
    expect(parseHtml(`<tr><td>PSSR</td><td>01/05/${far}</td></tr>`, 'https://x.test', { block: '<tr\\b' })).toEqual([]);
  });
});

describe('parseHtml title and date patterns', () => {
  it('reads the title from raw HTML and the date from a labelled cell', () => {
    const card = `<article class="course-index-item"><button aria-label="Compare toggle for the GMDSS Restricted Operator Certificate (ROC) course">x</button>
      <p>For mariners in Area A1 (VHF range). Updated 1 Jan ${Y}.</p><h3>Starts</h3><p>15 Dec ${Y}</p></article>
      <article class="course-index-item"><button aria-label="Compare toggle for the HNC Nautical Science course">x</button><h3>Starts</h3><p>1 Sep ${Y}</p></article>`;
    const d = parseHtml(card, 'https://x.test', { block: '<article class="course-index-item"', title: 'aria-label="Compare toggle for the ([^"]+) course"', titleHtml: true, date: 'Starts \\| ([^|]+)' });
    expect(d).toEqual([expect.objectContaining({ course_code: 'gmdss_roc', start_date: `${Y}-12-15` })]);
  });
});

describe('parseHtml dates from markup', () => {
  it('reads Bookwhen agenda rows from data-event', () => {
    const page = `<tr class="month_title"><td>November</td></tr>
      <tr data-hook="agenda_list_item" data-event="ev-s34rp-${Y}1101000000"><td class="dom">1</td><td class="summary"><button>RYA Marine Radio VHF - SRC Course</button></td></tr>
      <tr data-hook="agenda_list_item" data-event="ev-s8p21-${Y}1115090000"><td class="dom">15</td><td class="summary"><button>RYA Sea Survival</button></td></tr>`;
    const d = parseHtml(page, 'https://bookwhen.com/x', {
      block: '<tr data-hook="agenda_list_item"',
      title: 'class="summary">\\s*<button[^>]*>([^<]+)',
      titleHtml: true,
      date: 'data-event="ev-[a-z0-9]+-(\\d{4})(\\d{2})(\\d{2})',
      dateHtml: true,
    });
    expect(d).toEqual([expect.objectContaining({ course_code: 'src', start_date: `${Y}-11-01` })]);
    const cfg = { block: '<tr\\b', skip: 'online' };
    expect(parseHtml(`<tr><td>SRC (Online Course)</td><td>1 Nov ${Y}</td></tr><tr><td>SRC</td><td>2 Nov ${Y}</td></tr>`, 'https://x.test', cfg)).toEqual([
      expect.objectContaining({ start_date: `${Y}-11-02` }),
    ]);
  });
});
