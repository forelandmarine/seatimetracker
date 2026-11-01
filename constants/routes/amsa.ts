import type { CertRoute } from '../certRoutes';

/**
 * AMSA certificate routes, keyed by requirement id. Months are 30 days (AMSA,
 * Calculate sea service for an international certificate) and weeks are 7 days.
 * The first route of each list is the default and mirrors the certificate's own
 * figures.
 *
 * The task book reduction is not a route here: it is the profile toggle that
 * switches to `totalDaysWithRecordBook`. Near coastal (MO 505) routes carry
 * their own task book figures, so the toggle still works on them.
 */
export const AMSA_ROUTES: Record<string, CertRoute[]> = {
  // ── Near coastal, MO 505 Schedule 3 ──

  // (a) holding Master <45m: 180 / 360 days; (b) holding Mate <80m or a non command certificate: 360 / 720 days, all as officer of the watch.
  'amsa-master-100m-nc': [
    {
      id: 'standard',
      label: 'From Master <45m',
      summary: 'Holding Master <45m near coastal or Master <35m near coastal',
      source: 'MO 505 Sch 3, Master <100 m NC (a)',
    },
    {
      id: 'mate',
      label: 'From Mate <80m or non command',
      summary: 'Holding Mate <80m near coastal or a non command seafarer certificate such as Watchkeeper Deck',
      source: 'MO 505 Sch 3, Master <100 m NC (b)',
      totalDays: 720,
      totalDaysWithRecordBook: 360,
      watchkeepingDays: 720,
      watchkeepingDaysWithRecordBook: 360,
      caveat:
        'All of the service must be as officer of the watch on commercial vessels of 24 metres or more, while holding that certificate.',
    },
  ],
  // (a) 180 / 360 days; (b) with a workshop skills equivalent qualification 90 / 180 days.
  'amsa-med2-nc': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'No workshop skills equivalent qualification',
      source: 'MO 505 Sch 3, Marine Engine Driver Grade 2 NC (a)',
    },
    {
      id: 'workshop',
      label: 'Workshop skills route',
      summary: 'Holding a workshop skills equivalent qualification, such as a mechanical trade',
      source: 'MO 505 Sch 3, Marine Engine Driver Grade 2 NC (b)',
      totalDays: 180,
      totalDaysWithRecordBook: 90,
      caveat:
        'The service must be on commercial vessels with inboard diesel propulsion of 150 kW or more, while holding the workshop skills equivalent qualification.',
    },
  ],
  // (a) holding MED 2: 120 / 240 days; (b) with a workshop skills equivalent qualification 90 / 180 days.
  'amsa-med1-nc': [
    {
      id: 'standard',
      label: 'From MED Grade 2',
      summary: 'Holding Marine Engine Driver Grade 2 near coastal',
      source: 'MO 505 Sch 3, Marine Engine Driver Grade 1 NC (a)',
    },
    {
      id: 'workshop',
      label: 'Workshop skills route',
      summary: 'Holding a workshop skills equivalent qualification, such as a mechanical trade',
      source: 'MO 505 Sch 3, Marine Engine Driver Grade 1 NC (b)',
      totalDays: 180,
      totalDaysWithRecordBook: 90,
      caveat:
        'The service must be on commercial vessels with inboard diesel propulsion of 375 kW or more, while holding the workshop skills equivalent qualification.',
    },
  ],
  // (a) holding MED 1: 180 / 360 days; (b) workshop skills 120 / 240 days; (c) Engineer Watchkeeper 90 days, no task book only.
  'amsa-engineer-class3-nc': [
    {
      id: 'standard',
      label: 'From MED Grade 1',
      summary: 'Holding Marine Engine Driver Grade 1 near coastal',
      source: 'MO 505 Sch 3, Engineer Class 3 NC (a)',
    },
    {
      id: 'workshop',
      label: 'Workshop skills route',
      summary: 'Holding a workshop skills equivalent qualification, such as a mechanical trade',
      source: 'MO 505 Sch 3, Engineer Class 3 NC (b)',
      totalDays: 240,
      totalDaysWithRecordBook: 120,
      caveat:
        'The service must be on commercial vessels with inboard diesel engines of 400 kW or more, while holding the workshop skills equivalent qualification.',
    },
    {
      id: 'watchkeeper',
      label: 'From Engineer Watchkeeper',
      summary: 'Holding an Engineer Watchkeeper seafarer certificate issued under the Navigation Act',
      source: 'MO 505 Sch 3, Engineer Class 3 NC (c)',
      totalDays: 90,
      totalDaysWithRecordBook: 90,
      caveat:
        'MO 505 lists this route only without a task book, so the figure stays at 90 days whether or not you hold one. The service must be on commercial vessels with inboard diesel engines of 400 kW or more, while holding Engineer Watchkeeper.',
    },
  ],

  // ── Deck: international (STCW) yacht certificates, MO 74 Schedule 2 ──

  // 36 months, or 18 months inside an approved and monitored course.
  'amsa-wkd-3000gt-yachts': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Watchkeeping service on vessels of 12 metres or more outside an approved course',
      source: 'MO 74 Sch 2, Watchkeeper Deck <3000 GT (Yachts) (b)',
    },
    {
      id: 'approved-course',
      label: 'Approved course route',
      summary: 'Service gained as part of an approved and monitored course',
      source: 'MO 74 Sch 2, Watchkeeper Deck <3000 GT (Yachts) (b)',
      totalDays: 540,
      caveat:
        'The service must form part of an approved and monitored course. At least 240 days must still be on vessels of 20 metres or more on voyages of 24 hours or more, 180 of them as understudy to, or as, the officer of the watch.',
    },
  ],
  // Same service rule as the Watchkeeper (Yachts) certificate (MO 74 Sch 2 (a)).
  'amsa-chief-mate-3000gt-yachts': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Watchkeeping service on vessels of 12 metres or more outside an approved course',
      source: 'MO 74 Sch 2, Chief Mate <3000 GT (Yachts) (a)',
    },
    {
      id: 'approved-course',
      label: 'Approved course route',
      summary: 'Service gained as part of an approved and monitored course',
      source: 'MO 74 Sch 2, Chief Mate <3000 GT (Yachts) (a)',
      totalDays: 540,
      caveat:
        'The service must form part of an approved and monitored course. At least 240 days must still be on vessels of 20 metres or more on voyages of 24 hours or more, 180 of them as understudy to, or as, the officer of the watch.',
    },
  ],

  // ── Deck: international (STCW), MO 71 Schedule 2 ──

  // Four ways in: 36 months on 24 m+ vessels, or an onboard training programme
  // of 18 or 24 months on 500 GT+ vessels.
  'amsa-wkd': [
    {
      id: 'standard',
      label: 'Sea service route',
      summary: 'Sea service on vessels of 24 metres or more without a training programme',
      source: 'MO 71 Sch 2, Watchkeeper Deck 1(b)(iv)',
    },
    {
      id: 'approved-pre-sea',
      label: 'Approved pre-sea course route',
      summary: 'Approved pre-sea course followed by an approved onboard training programme for trainee deck officers',
      source: 'MO 71 Sch 2, Watchkeeper Deck 1(b)(i)',
      totalDays: 540,
      caveat:
        'The service must be on vessels of 500 GT or more inside the approved onboard training programme. At least 360 days must be on voyages of 24 hours or more, 180 of them as understudy to, or as, the officer of the watch.',
    },
    {
      id: 'training-programme',
      label: 'Onboard training programme route',
      summary: 'Pre-sea course and approved onboard programme, or the integrated rating and able seafarer programme',
      source: 'MO 71 Sch 2, Watchkeeper Deck 1(b)(ii), (iii)',
      totalDays: 720,
      caveat:
        'The service must be on vessels of 500 GT or more inside an approved onboard training programme; on the rating programme it must be gained while holding Integrated Rating or Able Seafarer Deck. At least 360 days must be on voyages of 24 hours or more, 180 of them as understudy to, or as, the officer of the watch.',
    },
  ],
  // Option 1: 36 months as officer of the watch. Option 2: 24 months with 12 as chief mate or master.
  'amsa-master-500gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Officer of the watch holding Master <45m near coastal or Mate <500 GT',
      source: 'MO 71 Sch 2, Master <500 GT Option 1',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate or master route',
      summary: 'Holding Mate <500 GT with the Chief Mate <3000 GT near coastal endorsement, serving as chief mate or master',
      source: 'MO 71 Sch 2, Master <500 GT Option 2',
      totalDays: 720,
      caveat:
        'All of it must be in charge of a navigational watch on vessels of 24 metres or more while holding that certificate, with at least 360 days as chief mate or master and 480 days on voyages of 24 hours or more.',
    },
  ],
  // (b)(i) 36 months; (b)(ii) 24 months with 12 as chief mate or master.
  'amsa-master-3000gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Officer of the watch with at least 12 months as chief mate',
      source: 'MO 71 Sch 2, Master <3000 GT (b)(i)',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate or master route',
      summary: 'At least 12 months already served as chief mate or master',
      source: 'MO 71 Sch 2, Master <3000 GT (b)(ii)',
      totalDays: 720,
      caveat:
        'All of it must be in charge of a navigational watch on vessels of 24 metres or more, with at least 360 days as chief mate or master while holding a qualifying certificate. At least 720 days on voyages of 24 hours or more still applies, so in practice all of it.',
    },
  ],
  // (b)(i) 36 months; (b)(ii) 24 months, all on voyages of 24 hours or more.
  'amsa-master': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Officer of the watch on vessels of 500 GT or more',
      source: 'MO 71 Sch 2, Master (b)(i)',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate or master route',
      summary: 'At least 12 months already served as chief mate or master',
      source: 'MO 71 Sch 2, Master (b)(ii)',
      totalDays: 720,
      caveat:
        'All of it must be on voyages of 24 hours or more, in charge of a navigational watch on vessels of 500 GT or more, with at least 180 days on vessels of 1,500 GT or more and 360 days as chief mate or master.',
    },
  ],

  // ── Engineering: international (STCW), MO 72 Schedule 2 ──

  // Cadet or trainee programme 36 weeks; engineering experience programme 26 weeks.
  'amsa-engineer-watchkeeper': [
    {
      id: 'standard',
      label: 'Cadet or trainee route',
      summary: 'Engineer cadet or trainee engineer programme',
      source: 'MO 72 Sch 2, Engineer Watchkeeper',
    },
    {
      id: 'class-3',
      label: 'Engineer Class 3 route',
      summary: 'Engineering experience programme for holders of Engineer Class 3 near coastal',
      source: 'MO 72 Sch 2, Engineer Watchkeeper (c) and engineering experience training program (b)',
      totalDays: 182,
      caveat:
        'The service must be on vessels of 750 kW or more while holding Engineer Class 3, which you must have held for at least 12 months. At least 112 days must be on the propulsion type the certificate covers.',
    },
  ],
  // Option 1: 6 months in a training programme. Option 2: 30 months in the engine department.
  'amsa-eto': [
    {
      id: 'standard',
      label: 'Training programme route',
      summary: 'Approved ETO training course of at least 12 months with a training record book',
      source: 'MO 72 Sch 2, Electro-technical officer Option 1',
    },
    {
      id: 'experience',
      label: 'Engine department route',
      summary: 'Engine department service instead of the onboard training programme',
      source: 'MO 72 Sch 2, Electro-technical officer Option 2',
      totalDays: 900,
      caveat:
        'The service must be in the engine department on vessels with at least 750 kW of installed electrical generating capacity. You also need an electrical trade certificate or an engineer certificate, and an approved course with at least 6 months of workshop training.',
    },
  ],
  // (b)(i) from Engineer Watchkeeper 12 months; (b)(ii) from Engineer Class 3 24 months.
  'amsa-engineer-class2': [
    {
      id: 'standard',
      label: 'From Engineer Class 3',
      summary: 'Holding Engineer Class 3 near coastal or a state unrestricted Engineer Class 3',
      source: 'MO 72 Sch 2, Engineer Class 2 (b)(ii)',
    },
    {
      id: 'watchkeeper',
      label: 'From Engineer Watchkeeper',
      summary: 'Holding Engineer Watchkeeper or an equivalent foreign certificate',
      source: 'MO 72 Sch 2, Engineer Class 2 (b)(i)',
      totalDays: 360,
      caveat:
        'The service must be on vessels of 750 kW or more while holding Engineer Watchkeeper, with at least 270 days on the propulsion type the certificate covers.',
    },
  ],
  // (b)(i) 36 months; (b)(ii) 24 months with 12 as first engineer; (b)(iii) 42 months via Class 3.
  'amsa-engineer-class1': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'In charge of an engine room watch holding Engineer Watchkeeper or Engineer Class 2',
      source: 'MO 72 Sch 2, Engineer Class 1 (b)(i)',
    },
    {
      id: 'first-engineer',
      label: 'First engineer route',
      summary: 'At least 12 months as first engineer on ships of 3,000 kW or more',
      source: 'MO 72 Sch 2, Engineer Class 1 (b)(ii)',
      totalDays: 720,
      caveat:
        'In charge of an engine room watch on vessels of 750 kW or more, with at least 360 days as first engineer on vessels of 3,000 kW or more while holding Engineer Class 2.',
    },
    {
      id: 'class-3',
      label: 'Engineer Class 3 route',
      summary: 'Service split between Engineer Class 3 and Engineer Class 2',
      source: 'MO 72 Sch 2, Engineer Class 1 (b)(iii)',
      totalDays: 1260,
      caveat:
        'In charge of an engine room watch on vessels of 750 kW or more, with at least 540 days on vessels of 3,000 kW or more while holding Engineer Class 2 and at least 720 days while holding Engineer Class 3.',
    },
  ],
};
