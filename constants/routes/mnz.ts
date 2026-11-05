import type { CertRoute } from '../certRoutes';

/**
 * MNZ certificate routes, keyed by requirement id. Months are 30 days (SeaCert
 * framework). The first route of each list is the default and mirrors the
 * certificate's own figures.
 *
 * Training record book, cadet programme and "training in reduction of sea
 * service" (rule 32.175) figures are not routes here: the record book toggle
 * covers them through totalDaysWithRecordBook.
 */
export const MNZ_ROUTES: Record<string, CertRoute[]> = {
  // Part 32 rule 32.62(2)(a): 12 months holding SRL 24 m, or 18 months in command.
  'mnz-srl-500gt': [
    {
      id: 'standard',
      label: 'Holding SRL endorsed to 24 metres',
      summary: 'Service on vessels of 12 metres or more while holding SRL endorsed to 24 metres',
      source: 'Part 32 rule 32.62(2)(a)(i)',
    },
    {
      id: 'in-command',
      label: 'In command route',
      summary: 'Service in command of commercial ships of 12 metres or more',
      source: 'Part 32 rule 32.62(2)(a)(ii)',
      totalDays: 540,
      caveat:
        'All 18 months must be in command of a commercial ship of 12 metres or more, and include a completed approved training record book.',
    },
  ],
  // SeaCert framework, certificate 8: 24, 18 or 12 months.
  'mnz-mfv-limited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Deck service on fishing vessels of 12 metres or more',
      source: 'SeaCert framework 8, option 1',
    },
    {
      id: 'holding-adhf',
      label: 'Holding ADH-F',
      summary: 'Holders of Advanced Deckhand Fishing',
      source: 'SeaCert framework 8, option 2',
      totalDays: 540,
      caveat: 'At least 12 months must be outside restricted limits while holding ADH-F.',
    },
    {
      id: 'holding-sco',
      label: 'Holding SCO',
      summary: 'Holders of Skipper Coastal/Offshore',
      source: 'SeaCert framework 8, option 3',
      totalDays: 360,
      caveat:
        'The service must be in a deck capacity on fishing vessels of 12 metres or more while holding SCO, with at least 6 months outside restricted limits.',
    },
  ],
  // Part 32 Table 19 item 4: 36 months, or 24 months with 12 as chief mate or master.
  'mnz-master-500gt': [
    {
      id: 'standard',
      label: 'Officer of the watch route',
      summary: 'Service as officer of the watch while holding Watchkeeper Deck <500 GT NC or Master <500 GT NC',
      source: 'Part 32 Table 19, item 4(a)',
    },
    {
      id: 'chief-mate-or-master',
      label: 'Chief mate or master route',
      summary: 'Holders of Master <500 GT NC with service as chief mate or master',
      source: 'Part 32 Table 19, item 4(b)',
      totalDays: 720,
      caveat:
        'At least 12 months must be as chief mate or master while holding Master <500 GT NC, on ships of 24 metres or 80 GT or more.',
    },
  ],
  // SeaCert framework, certificate 19: 36 months, or 24 with 12 as chief mate.
  'mnz-master-3000gt': [
    {
      id: 'standard',
      label: 'Officer of the watch route',
      summary: 'Service as officer of the watch while holding Watchkeeper Deck',
      source: 'SeaCert framework 19, option 1',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate route',
      summary: 'Holders of Chief Mate <3000 GT or higher with service as chief mate',
      source: 'SeaCert framework 19, option 2',
      totalDays: 720,
      caveat:
        'At least 12 months must be as chief mate while holding Chief Mate <3000 GT or higher; the rest as officer of the watch.',
    },
  ],
  // SeaCert framework, certificate 20: 36 months, or 24 with 12 as chief mate.
  'mnz-master': [
    {
      id: 'standard',
      label: 'Officer of the watch route',
      summary: 'Service as officer of the watch while holding Watchkeeper Deck or higher',
      source: 'SeaCert framework 20, option 1',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate route',
      summary: 'Holders of Chief Mate with service as chief mate',
      source: 'SeaCert framework 20, option 2',
      totalDays: 720,
      caveat:
        'At least 12 months must be as chief mate while holding Chief Mate, and the other 12 as officer of the watch, on ships of 500 GT or more.',
    },
  ],
  // Part 32 Table 27 item 4: holding Chief Mate Yacht, or holding Master Yacht <500 GT.
  'mnz-master-yacht': [
    {
      id: 'standard',
      label: 'Holding Chief Mate Yacht',
      summary: 'Deck officer service while holding Chief Mate Yacht',
      source: 'Part 32 Table 27, item 4(a)',
    },
    {
      id: 'holding-my500',
      label: 'Holding Master Yacht <500 GT',
      summary: 'Deck officer service while holding Master Yacht <500 GT',
      source: 'Part 32 Table 27, item 4(b)',
      totalDays: 360,
      watchkeepingDays: 120,
      caveat:
        'Must include 6 months on ships of 24 metres or 80 GT or more, or 3 months on ships of 500 GT or more.',
    },
  ],
  // SeaCert framework, certificate 27: 12 months, 6 with training, 3 with an electrical qualification.
  'mnz-etr': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Sea service on vessels of 750 kW or more, with or without the training course',
      source: 'SeaCert framework 27, options 1 and 3',
    },
    {
      id: 'electrical',
      label: 'Electrical qualification route',
      summary: 'Holders of a Certificate in Electrical Engineering (Level 4) or equivalent',
      source: 'SeaCert framework 27, option 2; STCW III/7',
      totalDays: 90,
      caveat: 'Maritime NZ assesses equivalent qualifications case by case.',
    },
  ],
  // Part 32 Table 7 item 4: 12 months holding MEC 6, or 24 months with a record book.
  'mnz-mec5': [
    {
      id: 'standard',
      label: 'Holding MEC 6',
      summary: 'Service as an engineer while holding MEC 6',
      source: 'Part 32 Table 7, item 4(a)',
    },
    {
      id: 'record-book',
      label: 'Training record book route',
      summary: 'Not holding MEC 6, with an approved training record book',
      source: 'Part 32 Table 7, item 4(b)',
      totalDays: 720,
      caveat:
        'The service must be on ships of 100 kW or more, with the record book completed on board within the 5 years before you apply.',
    },
  ],
  // Part 32 Table 8 item 4: 36 months, or 12 months plus 2 years practical training.
  'mnz-mec5-steam': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Sea service including 12 months on steam engines or boilers',
      source: 'Part 32 Table 8, item 4(a)',
      caveat:
        'The 36 months need not all fall in the last 10 years, but 12 months on steam must. The app counts only the 10-year window.',
    },
    {
      id: 'practical-training',
      label: 'With 2 years practical training',
      summary: 'Holders of 2 years craft, industrial or other practical training',
      source: 'Part 32 Table 8, item 4(c)',
      totalDays: 360,
      caveat:
        'All 12 months must be on steam engines or boilers. Land installation experience can count instead but is not logged in the app.',
    },
  ],
  // Part 32 Table 9 item 4: 36, 12 (holding MEC 6) or 24 months.
  'mnz-mec5-motor-steam': [
    {
      id: 'standard',
      label: 'Holding MEC 6',
      summary: 'Service as an engineer on vessels of 100 kW or more while holding MEC 6',
      source: 'Part 32 Table 9, item 4(b)',
      caveat: 'Must include 6 months on diesel engines and 6 months on steam engines or boilers.',
    },
    {
      id: 'full',
      label: 'Full sea service route',
      summary: 'Not holding MEC 6',
      source: 'Part 32 Table 9, item 4(a)',
      totalDays: 1080,
      caveat: 'Must include 30 months on diesel engines and 6 months on steam engines or boilers.',
    },
    {
      id: 'engineer',
      label: 'Engineer route',
      summary: 'Service as an engineer on vessels of 100 kW or more, not holding MEC 6',
      source: 'Part 32 Table 9, item 4(c)',
      totalDays: 720,
      caveat: 'Must include 18 months on diesel engines and 6 months on steam engines or boilers.',
    },
  ],
  // Part 32 Table 10 item 4: 12 months holding MEC 5 or with shore training, 24 holding MEC 6.
  'mnz-mec4': [
    {
      id: 'standard',
      label: 'Holding MEC 5 or shore training',
      summary: 'Holders of MEC 5, or with approved shore-based engineering training',
      source: 'Part 32 Table 10, item 4(a) and (b)',
    },
    {
      id: 'holding-mec6',
      label: 'Holding MEC 6',
      summary: 'Holders of MEC 6',
      source: 'Part 32 Table 10, item 4(c)',
      totalDays: 720,
      caveat: 'The service must be on ships of 250 kW or more beyond restricted limits while holding MEC 6.',
    },
  ],
  // SeaCert framework, certificate 38: 36 months, or 24 with 12 as second engineer.
  'mnz-mec1': [
    {
      id: 'standard',
      label: 'Engineering watch route',
      summary: 'Service as officer in charge of an engineering watch while holding MEC 3 or higher',
      source: 'SeaCert framework 38, option 1',
    },
    {
      id: 'second-engineer',
      label: 'Second engineer route',
      summary: 'Holders of MEC 2 with service as second engineer',
      source: 'SeaCert framework 38, option 2',
      totalDays: 720,
      caveat:
        'At least 12 months must be as second engineer while holding MEC 2, on vessels of 750 kW or more; the rest as officer in charge of an engineering watch.',
    },
  ],
};
