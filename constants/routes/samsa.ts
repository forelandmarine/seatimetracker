import type { CertRoute } from '../certRoutes';

/**
 * SAMSA certificate routes, keyed by requirement id. Officer and rating figures
 * are from the Merchant Shipping (Training, Certification and Safe Manning)
 * Regulations 2021; small vessel hours are from Marine Notice 13 of 2011
 * section 10.5. Months are 30 days. The first route of each list is the default
 * and mirrors the certificate's own figures.
 *
 * SAMSA has no record book toggle in the app, so the accelerated training
 * routes are routes here. Where a route's service is in a rank rather than as a
 * watchkeeper (chief mate, second engineer), watchkeepingDays is 0 so the
 * default route's watchkeeping bar is not carried over.
 */
export const SAMSA_ROUTES: Record<string, CertRoute[]> = {
  // ── Deck officers ────────────────────────────────────────────────────

  // Reg 24: 36 months as OOW, or 24 months with 12 as chief mate.
  'samsa-master': [
    {
      id: 'standard',
      label: 'Officer of the watch route',
      summary: 'Holders of an OOW or Chief Mate CoC with service as officer of the watch',
      source: 'TCSM Regs 2021 reg 24(b)',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate route',
      summary: 'Holders of a Chief Mate CoC',
      source: 'TCSM Regs 2021 reg 24(a)',
      totalDays: 720,
      watchkeepingDays: 0,
      caveat: 'At least 12 months must be as chief mate on trading ships of 1 600 GT or more on unlimited voyages.',
    },
  ],
  // Reg 26: 36 months as OOW, or 24 months with 12 as chief mate.
  'samsa-master-3000': [
    {
      id: 'standard',
      label: 'Officer of the watch route',
      summary: 'Holders of an OOW, Chief Mate or Chief Mate (<3 000 GT) CoC with service as officer of the watch',
      source: 'TCSM Regs 2021 reg 26(b)',
    },
    {
      id: 'chief-mate',
      label: 'Chief mate route',
      summary: 'Holders of a Chief Mate or Chief Mate (<3 000 GT) CoC',
      source: 'TCSM Regs 2021 reg 26(a)',
      totalDays: 720,
      watchkeepingDays: 0,
      caveat: 'At least 12 months must be as chief mate on trading ships of 500 GT or more on unlimited voyages.',
    },
  ],
  // Reg 28: 36 months, or 12 months on an accelerated programme.
  'samsa-oow-unlimited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Entry without accelerated training, with an approved training record book',
      source: 'TCSM Regs 2021 reg 28(a)',
    },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'Cadets on an accredited accelerated training programme',
      source: 'TCSM Regs 2021 reg 28(b)',
      totalDays: 360,
      caveat: 'The 12 months must be part of the accredited programme, documented in an approved record book.',
    },
  ],
  // Reg 30: 36 months on 100 GT+, or 12 months accelerated on 500 GT+ unlimited.
  'samsa-oow-500-nc': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Entry without accelerated training, with an approved training record book',
      source: 'TCSM Regs 2021 reg 30(a)',
    },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'Cadets on an accredited accelerated training programme',
      source: 'TCSM Regs 2021 reg 30(b)',
      totalDays: 360,
      caveat:
        'On this route the service must be on trading ships of 500 GT or more on unlimited voyages, not 100 GT near-coastal.',
    },
  ],

  // ── Deck: port operations ────────────────────────────────────────────

  // Reg 32: 6 months from Master (<1 600 GT PO), 12 months from Skipper (<200 GT PO).
  'samsa-master-port-ops': [
    {
      id: 'standard',
      label: 'Holding Master (<1 600 GT port operations)',
      summary: 'Holders of Master (<1 600 GT Port Operations)',
      source: 'TCSM Regs 2021 reg 32(a)',
    },
    {
      id: 'from-skipper',
      label: 'Holding Skipper (<200 GT port operations)',
      summary: 'Holders of Skipper (<200 GT Port Operations)',
      source: 'TCSM Regs 2021 reg 32(b)',
      totalDays: 360,
      watchkeepingDays: 360,
      caveat: 'The service must be as officer of the watch on port operations vessels of 1 600 GT or more.',
    },
  ],
  // Reg 34: 12 months, or 9 months for small vessel skipper holders.
  'samsa-skipper-200-port-ops': [
    {
      id: 'standard',
      label: 'Direct entry',
      summary: 'Deck department service with no small vessel skipper certificate',
      source: 'TCSM Regs 2021 reg 34(a)',
    },
    {
      id: 'small-vessel-skipper',
      label: 'Holding Coastal or Offshore Skipper',
      summary: 'Holders of Coastal Skipper 9 m or more, or Skipper Offshore 9 m or more',
      source: 'TCSM Regs 2021 reg 34(b)',
      totalDays: 270,
    },
  ],

  // ── Deck ratings ─────────────────────────────────────────────────────

  // Reg 66: 6 months, or 2 months accelerated.
  'samsa-os-deck': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 66(2)(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 66(2)(b)',
      totalDays: 60,
    },
  ],
  // Reg 63: 18 months, or 12 months accelerated, holding OS Deck.
  'samsa-ab-deck': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 63(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an accredited accelerated training programme',
      source: 'TCSM Regs 2021 reg 63(b)',
      totalDays: 360,
    },
  ],
  // Reg 68: 6 months, or 2 months accelerated.
  'samsa-os-deck-port-ops': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 68(2)(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 68(2)(b)',
      totalDays: 60,
    },
  ],
  // Reg 65: 12 months, or 6 months accelerated.
  'samsa-ab-deck-port-ops': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 65(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 65(b)',
      totalDays: 180,
    },
  ],
  // Reg 75: 18 months from OS Deck and OS Engine, 6 months from an AB.
  'samsa-gpr-port-ops': [
    {
      id: 'standard',
      label: 'Holding OS Deck and OS Engine',
      summary: 'Holders of both Ordinary Seafarer certificates',
      source: 'TCSM Regs 2021 reg 75(a)',
    },
    {
      id: 'from-ab',
      label: 'Holding AB Deck or AB Engine',
      summary: 'Holders of an Able Seafarer certificate, deck or engine',
      source: 'TCSM Regs 2021 reg 75(b)',
      totalDays: 180,
      caveat:
        'The service is in the other department: 2 months as a hand, then 4 months holding a provisional OS certificate for that department.',
    },
  ],

  // ── Engineer officers ────────────────────────────────────────────────

  // Reg 47: 36 months as EOOW, or 12 months as second engineer.
  'samsa-chief-engineer': [
    {
      id: 'standard',
      label: 'Engineering watch route',
      summary: 'Holders of an EOOW CoC with service as officer in charge of an engineering watch',
      source: 'TCSM Regs 2021 reg 47(a)',
    },
    {
      id: 'second-engineer',
      label: 'Second engineer route',
      summary: 'Holders of a Second Engineer or Chief Engineer (<3 000 kW) CoC',
      source: 'TCSM Regs 2021 reg 47(b), (c)',
      totalDays: 360,
      watchkeepingDays: 0,
      caveat: 'The 12 months must be served as second engineer on trading ships of at least 3 000 kW.',
    },
  ],
  // Reg 48: 12 months as EOOW, or 6 months holding Second Engineer (<3 000 kW).
  'samsa-second-engineer': [
    {
      id: 'standard',
      label: 'Holding EOOW',
      summary: 'Holders of an EOOW CoC',
      source: 'TCSM Regs 2021 reg 48(a)',
    },
    {
      id: 'from-second-3000',
      label: 'Holding Second Engineer (<3 000 kW)',
      summary: 'Holders of a Second Engineer Officer (<3 000 kW) CoC',
      source: 'TCSM Regs 2021 reg 48(b)',
      totalDays: 180,
      watchkeepingDays: 180,
      caveat: 'The service must be as EOOW on trading ships of 3 000 kW or more.',
    },
  ],
  // Reg 49: 36 months as EOOW, or 12 months as second engineer.
  'samsa-chief-engineer-3000': [
    {
      id: 'standard',
      label: 'Engineering watch route',
      summary: 'Holders of an EOOW CoC with service as officer in charge of an engineering watch',
      source: 'TCSM Regs 2021 reg 49(a)',
    },
    {
      id: 'second-engineer',
      label: 'Second engineer route',
      summary: 'Holders of a Second Engineer Officer (<3 000 kW) CoC',
      source: 'TCSM Regs 2021 reg 49(b)',
      totalDays: 360,
      watchkeepingDays: 0,
      caveat: 'The 12 months must be served as second engineer on trading ships of 750 kW or more.',
    },
  ],
  // Reg 51: 36 months, or 12 months on an accelerated programme.
  'samsa-eoow': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Entry without accelerated training, with an approved training record book',
      source: 'TCSM Regs 2021 reg 51(a)',
    },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'Cadets on an accredited accelerated training programme',
      source: 'TCSM Regs 2021 reg 51(b)',
      totalDays: 360,
      caveat: 'The 12 months must be part of the accredited programme, documented in an approved record book.',
    },
  ],
  // Reg 52: 36 months, or 12 months on an accelerated programme.
  'samsa-eto': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Entry without accelerated training',
      source: 'TCSM Regs 2021 reg 52(b)',
    },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 52(a)',
      totalDays: 360,
    },
  ],

  // ── Engineer officers: port operations and small vessels ─────────────

  // Reg 53: 12 months from CE (<1 500 kW PO), 18 months from CE (<750 kW PO).
  'samsa-chief-engineer-port-ops': [
    {
      id: 'standard',
      label: 'Holding Chief Engineer (<1 500 kW port operations)',
      summary: 'Holders of Chief Engineer Officer (<1 500 kW Port Operations)',
      source: 'TCSM Regs 2021 reg 53(a)',
    },
    {
      id: 'from-ce-750',
      label: 'Holding Chief Engineer (<750 kW port operations)',
      summary: 'Holders of Chief Engineer Officer (<750 kW Port Operations)',
      source: 'TCSM Regs 2021 reg 53(b)',
      totalDays: 540,
      watchkeepingDays: 540,
      caveat:
        'The service must be as EOOW on ships of 750 kW or more, with at least 6 months on ships of 1 500 kW or more.',
    },
  ],
  // Reg 54: 18 months direct entry, 12 months from CE (<750 kW PO).
  'samsa-chief-engineer-1500-port-ops': [
    {
      id: 'standard',
      label: 'Direct entry',
      summary: 'Entry on an accredited accelerated training programme',
      source: 'TCSM Regs 2021 reg 54(a)',
    },
    {
      id: 'from-ce-750',
      label: 'Holding Chief Engineer (<750 kW port operations)',
      summary: 'Holders of Chief Engineer Officer (<750 kW Port Operations)',
      source: 'TCSM Regs 2021 reg 54(b)',
      totalDays: 360,
      watchkeepingDays: 360,
      caveat:
        'The service must be as an engineer officer in charge of a watch on vessels of 750 kW or more, plus an approved accelerated training programme.',
    },
  ],
  // Reg 55: 18 months direct entry, 12 months from EOOW (PO) or with a trade certificate.
  'samsa-chief-engineer-750-port-ops': [
    {
      id: 'standard',
      label: 'Direct entry',
      summary: 'Entry with no engineer certificate or trade certificate',
      source: 'TCSM Regs 2021 reg 55(b)',
    },
    {
      id: 'eoow-or-trade',
      label: 'Holding EOOW (port operations) or a trade certificate',
      summary: 'Holders of EOOW (Port Operations) or an approved trade certificate',
      source: 'TCSM Regs 2021 reg 55(a), (c)',
      totalDays: 360,
    },
  ],
  // Reg 57: 12 months from EOOW (<750 kW), 6 months from CE (<750 kW PO).
  'samsa-chief-engineer-750': [
    {
      id: 'standard',
      label: 'Holding EOOW (<750 kW)',
      summary: 'Holders of Officer in Charge of an Engineering Watch (<750 kW)',
      source: 'TCSM Regs 2021 reg 57(a)',
    },
    {
      id: 'from-ce-750-po',
      label: 'Holding Chief Engineer (<750 kW port operations)',
      summary: 'Holders of Chief Engineer Officer (<750 kW Port Operations)',
      source: 'TCSM Regs 2021 reg 57(b)',
      totalDays: 180,
    },
  ],
  // Reg 58: 18 months direct entry, 12 months from Second Engineer (PO) or with a trade certificate.
  'samsa-eoow-750': [
    {
      id: 'standard',
      label: 'Direct entry',
      summary: 'Entry with no prior engineering experience',
      source: 'TCSM Regs 2021 reg 58(a)',
    },
    {
      id: 'second-or-trade',
      label: 'Holding Second Engineer (port operations) or a trade certificate',
      summary: 'Holders of Second Engineer (Port Operations) or an approved trade certificate',
      source: 'TCSM Regs 2021 reg 58(b), (c)',
      totalDays: 360,
    },
  ],

  // ── Engine ratings ───────────────────────────────────────────────────

  // Reg 72: 6 months, or 2 months accelerated.
  'samsa-os-engine': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 72(2)(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 72(2)(b)',
      totalDays: 60,
    },
  ],
  // Reg 70: 12 months, or 6 months accelerated, holding OS Engine.
  'samsa-ab-engine': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 70(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 70(b)',
      totalDays: 180,
    },
  ],
  // Reg 73: 6 months, or 2 months accelerated.
  'samsa-os-engine-port-ops': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 73(2)(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'Entry with accelerated training',
      source: 'TCSM Regs 2021 reg 73(2)(b)',
      totalDays: 60,
    },
  ],
  // Reg 71: 12 months, or 6 months accelerated.
  'samsa-ab-engine-port-ops': [
    { id: 'standard', label: 'Standard route', summary: 'Entry without accelerated training', source: 'TCSM Regs 2021 reg 71(a)' },
    {
      id: 'accelerated',
      label: 'Accelerated training route',
      summary: 'On an approved accelerated training programme',
      source: 'TCSM Regs 2021 reg 71(b)',
      totalDays: 180,
    },
  ],

  // ── Small vessel skippers (MN 13 of 2011, logged hours) ──────────────
  // Most have three ways in: a SAMSA approved training institution plus hours,
  // hours tutored by a certificated skipper, or untutored hours. Day Skipper
  // Local Waters has no training route, and Inland Waters (Restricted) has only
  // the tutored one, so it has no routes. The app counts all logged hours the
  // same, so it cannot tell tutored from untutored time.

  'samsa-skipper-inland': [
    {
      id: 'standard',
      label: 'Training institution route',
      summary: 'Attended a SAMSA approved training institution',
      source: 'MN 13 of 2011 s 10.5.1.2',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours certified by a qualified skipper taking responsibility for tutorship',
      source: 'MN 13 of 2011 s 10.5.1.2',
      totalHours: 50,
    },
    {
      id: 'untutored',
      label: 'Logged hours route',
      summary: 'Logged hours with no training institution or tutorship',
      source: 'MN 13 of 2011 s 10.5.1.2',
      totalHours: 100,
    },
  ],
  'samsa-day-skipper-local': [
    {
      id: 'standard',
      label: 'Tutored route',
      summary: 'Hours certified by a qualified skipper taking responsibility for tutorship',
      source: 'MN 13 of 2011 s 10.5.2.1',
    },
    {
      id: 'untutored',
      label: 'Logged hours route',
      summary: 'Logged hours with no tutorship',
      source: 'MN 13 of 2011 s 10.5.2.1',
      totalHours: 100,
    },
  ],
  'samsa-day-skipper-e': [
    {
      id: 'standard',
      label: 'Training institution route',
      summary: 'Attended a SAMSA approved training institution',
      source: 'MN 13 of 2011 s 10.5.2.2',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours certified by a qualified skipper taking responsibility for tutorship',
      source: 'MN 13 of 2011 s 10.5.2.2',
      totalHours: 50,
    },
    {
      id: 'untutored',
      label: 'Logged hours route',
      summary: 'Logged hours not under the tuition of a certificated skipper',
      source: 'MN 13 of 2011 s 10.5.2.2',
      totalHours: 100,
    },
  ],
  'samsa-day-skipper-c': [
    {
      id: 'standard',
      label: 'Training institution route',
      summary: 'Attended a SAMSA approved training institution',
      source: 'MN 13 of 2011 s 10.5.2.3',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours certified by a qualified skipper taking responsibility for tutorship',
      source: 'MN 13 of 2011 s 10.5.2.3',
      totalHours: 50,
    },
    {
      id: 'untutored',
      label: 'Logged hours route',
      summary: 'Logged hours with no training institution or tutorship',
      source: 'MN 13 of 2011 s 10.5.2.3',
      totalHours: 100,
    },
  ],
  'samsa-day-skipper-b': [
    {
      id: 'standard',
      label: 'Training institution route',
      summary: 'Attended a SAMSA approved training institution',
      source: 'MN 13 of 2011 s 10.5.2.4',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours certified by a qualified skipper taking responsibility for tutorship',
      source: 'MN 13 of 2011 s 10.5.2.4',
      totalHours: 100,
      caveat: 'The hours must be on Category C or higher vessels of the appropriate length.',
    },
    {
      id: 'untutored',
      label: 'Logged hours route',
      summary: 'Logged hours with no training institution or tutorship',
      source: 'MN 13 of 2011 s 10.5.2.4',
      totalHours: 200,
      caveat: 'The hours must be on Category C or higher vessels of the appropriate length.',
    },
  ],
  'samsa-coastal-skipper-u9': [
    {
      id: 'standard',
      label: 'Training institution or Day Skipper route',
      summary: 'Attended a SAMSA approved training institution, or holds Day Skipper Category B or C',
      source: 'MN 13 of 2011 s 10.5.2.5',
      caveat: 'At least 50 of the hours must be logged at night.',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours certified by a skipper taking responsibility for tutorship',
      source: 'MN 13 of 2011 s 10.5.2.5',
      totalHours: 200,
      caveat: 'On Category C or higher vessels under 9 m, with at least 50 hours logged at night.',
    },
    {
      id: 'untutored',
      label: 'Logged hours route',
      summary: 'Logged hours not obtained under any tuition',
      source: 'MN 13 of 2011 s 10.5.2.5',
      totalHours: 300,
      caveat: 'On Category C or higher vessels under 9 m, with at least 50 hours logged at night.',
    },
  ],
  'samsa-skipper-offshore-u9': [
    {
      id: 'standard',
      label: 'Training institution route',
      summary: 'Attended a SAMSA approved training institution',
      source: 'MN 13 of 2011 s 10.5.2.6',
      caveat: 'At least 50 hours must be at night, with at least three overnight passages.',
    },
    {
      id: 'holding-coastal',
      label: 'Holding Coastal Skipper under 9 m',
      summary: 'Holders of Coastal Skipper under 9 m',
      source: 'MN 13 of 2011 s 10.5.2.6',
      totalHours: 100,
      caveat: 'Must include at least three overnight passages.',
    },
    {
      id: 'holding-day-b',
      label: 'Holding Day Skipper Category B',
      summary: 'Holders of Day Skipper Category B under 9 m',
      source: 'MN 13 of 2011 s 10.5.2.6',
      totalHours: 300,
      caveat: 'At least 50 hours must be at night, with at least three overnight passages.',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours under the tuition of a certificated Skipper Offshore under 9 m',
      source: 'MN 13 of 2011 s 10.5.2.6',
      totalHours: 500,
      caveat: 'At least 50 hours must be at night, with at least three overnight passages.',
    },
  ],
  'samsa-coastal-skipper-9': [
    {
      id: 'standard',
      label: 'Training institution route',
      summary: 'Attended a SAMSA approved training institution',
      source: 'MN 13 of 2011 s 10.5.2.7',
      caveat: 'On vessels over 9 m, with at least 50 hours logged at night.',
    },
    {
      id: 'holding-day-b',
      label: 'Holding Day Skipper Category B',
      summary: 'Holders of Day Skipper Category B over 9 m',
      source: 'MN 13 of 2011 s 10.5.2.7',
      totalHours: 150,
      caveat: 'On vessels over 9 m, with at least 50 hours logged at night.',
    },
    {
      id: 'holding-u9',
      label: 'Holding Coastal or Offshore Skipper under 9 m',
      summary: 'Holders of Coastal Skipper or Skipper Offshore under 9 m',
      source: 'MN 13 of 2011 s 10.5.2.7',
      totalHours: 100,
      caveat: 'On vessels over 9 m, with at least 50 hours logged at night.',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours under the tuition of a certificated skipper',
      source: 'MN 13 of 2011 s 10.5.2.7',
      totalHours: 350,
      caveat: 'On vessels over 9 m, with at least 50 hours logged at night.',
    },
  ],
  'samsa-skipper-offshore-9': [
    {
      id: 'standard',
      label: 'Holding Coastal Skipper over 9 m',
      summary: 'Holders of Coastal Skipper over 9 m',
      source: 'MN 13 of 2011 s 10.5.2.8',
      caveat: 'On vessels over 9 m, with at least 50 hours at night and three overnight passages.',
    },
    {
      id: 'training-or-day-local',
      label: 'Training institution or Day Skipper route',
      summary: 'Attended a SAMSA approved training institution, or holds Day Skipper Local Waters over 9 m',
      source: 'MN 13 of 2011 s 10.5.2.8',
      totalHours: 500,
      caveat: 'On vessels over 9 m, with at least 50 hours at night and three overnight passages.',
    },
    {
      id: 'tutored',
      label: 'Tutored route',
      summary: 'Hours under the tuition of a certificated skipper',
      source: 'MN 13 of 2011 s 10.5.2.8',
      totalHours: 1000,
      caveat: 'On vessels over 9 m, with at least 50 hours at night and three overnight passages.',
    },
  ],
};
