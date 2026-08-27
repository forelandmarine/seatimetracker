
export interface MCARequirement {
  id: string;
  title: string;
  regulation: string;
  description: string;
  /** Optional grouping heading used by the requirements screen (USCG lists are long). */
  category?: string;
  /** Headline qualifying-service target in creditable days, where the rules state one. */
  totalDays?: number;
  requirements: {
    label: string;
    value: string;
    details?: string[];
  }[];
  notes?: string[];
}

export const MCA_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'oow-yachts-3000gt',
    title: 'Officer of the Watch (OOW) Yachts <3000 GT',
    regulation: 'Reg II/1',
    description: 'Qualifying sea service to apply (NOE)',
    requirements: [
      {
        label: 'Total Onboard Service',
        value: '36 months',
        details: [
          'Since age 16',
          'Onboard yacht service',
          'Including at least 365 days seagoing service on vessels ≥ 15m load line length',
        ],
      },
      {
        label: 'Seagoing Service',
        value: '≥ 250 days',
        details: ['Must be actual seagoing service'],
      },
      {
        label: 'Additional Service',
        value: '115 days',
        details: [
          'Made up of any combination of:',
          '- Seagoing service',
          '- Standby service (max 14 consecutive days at one time; standby period cannot exceed previous voyage length)',
          '- Yard service (up to 90 days total, continuous or split)',
        ],
      },
    ],
    notes: [
      'The same MCA page also flags completion of an MCA Yacht Training Record Book',
      'Exception: If you can demonstrate 36 months\' actual seagoing service on vessels ≥24m',
    ],
  },
  {
    id: 'master-yachts-500gt',
    title: 'Master (Yachts) <500 GT Unlimited Area',
    regulation: 'Reg II/2',
    description: 'Service after OOW',
    requirements: [
      {
        label: 'Onboard Service',
        value: '12 months',
        details: [
          'While serving as OOW (Yachts <3000 GT)',
          'As a deck officer',
          'On vessels ≥15m load line length',
        ],
      },
      {
        label: 'Watchkeeping Service',
        value: '≥ 120 days',
        details: ['Must be watchkeeping service'],
      },
    ],
  },
  {
    id: 'master-yachts-3000gt',
    title: 'Master (Yachts) <3000 GT Unlimited Area',
    regulation: 'Reg II/2',
    description: 'Service after OOW',
    requirements: [
      {
        label: 'Onboard Service',
        value: '24 months',
        details: [
          'While serving as OOW (Yachts <3000 GT)',
          'As a deck officer',
          'All on vessels ≥15m load line length',
        ],
      },
      {
        label: 'Watchkeeping Service',
        value: '≥ 240 days',
        details: ['Must be watchkeeping service'],
      },
      {
        label: 'Additional Requirement',
        value: 'Either:',
        details: [
          '12 months on vessels ≥24m load line length, OR',
          '6 months on vessels ≥500 GT',
        ],
      },
    ],
  },
];

// ── Engineering department pathways (SV - Small Vessel) ──────────────
// Based on MSN 1904 (M+F) - UK Requirements for Engineer Officer
// Small Vessel Certificate of Competency (December 2022)
// Replaces the discontinued Y1/Y2/Y3 yacht engineering pathway.

const ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'meol-sv',
    title: 'Marine Engine Operator Licence (MEOL SV)',
    regulation: 'Non-STCW',
    description: 'Small vessels 200-750 kW (where STCW does not apply)',
    requirements: [
      {
        label: 'Onboard Service',
        value: '24 months',
        details: [
          'As engineer responsible for system maintenance',
          'On vessels of 200 kW or more in propulsion power',
          'At least 6 months must be seagoing service',
          'Alternative: 36 months as dual-purpose deck hand and engineer on vessels ≥200 kW (6 months seagoing in engineering dept)',
        ],
      },
    ],
    notes: [
      'Minimum age 19',
      'Non-STCW - valid for UK waters only, not guaranteed internationally',
      'Requires AEC 1 & 2, ENG1 medical, MCA oral examination',
      'Also qualifies for entry onto the Experienced Seafarer Route (section 4.4)',
    ],
  },
  {
    id: 'eoow-sv',
    title: 'EOOW Engineer Officer of the Watch (SV)',
    regulation: 'STCW III/2, VII',
    description: '<9,000 kW, <3,000 GT, unlimited area',
    requirements: [
      {
        label: 'Standard Route (section 4.3)',
        value: '12 months',
        details: [
          'Combined seagoing service and workshop training',
          '6 months seagoing in watchkeeping or UMS duties on vessels ≥350 kW',
          '5 months seagoing service on vessels ≥350 kW',
          '2 weeks MCA-approved initial Workshop Skills Training',
          'Plus 2 weeks additional seagoing on vessels ≥350 kW OR 2 weeks additional Workshop Skills Training',
        ],
      },
      {
        label: 'Experienced Seafarer Route (section 4.4)',
        value: '24 months onboard + 11 months post-registration',
        details: [
          'Entry: 24 months onboard service with 6 months seagoing on vessels ≥200 kW',
          'Post-registration: 11 months additional seagoing on vessels ≥350 kW',
          'Min 6 months engaged in watchkeeping or UMS duties',
          '2 weeks Workshop Skills Training',
          'Plus 2 weeks additional seagoing ≥350 kW OR 2 weeks additional Workshop Skills Training',
        ],
      },
      {
        label: 'Watchkeeping Requirement',
        value: 'Min 6 months',
        details: [
          'Engine room watchkeeping or UMS duties',
          'Watchkeeping = min 4 hours out of every 24 hours on engine room watch',
          'Can be performed in a subsidiary capacity for EOOW',
        ],
      },
    ],
    notes: [
      'Minimum age 18',
      'Requires AEC I & II, Diploma in Maritime Studies (or MCA-approved equivalent)',
      'Alternative route available for graduates/HND/HNC holders (section 4.7)',
      'MCA oral examination required',
      'NOE valid for 5 years from date of issue',
      'Yard/dry dock time: Standard route - none allowed; Experienced route - up to 90 days toward total service; Alternative route - 25% or 3 months (whichever is less)',
    ],
  },
  {
    id: 'chief-engineer-sv-500gt',
    title: 'Chief Engineer (SV) <500 GT, <3,000 kW',
    regulation: 'STCW III/3, VII',
    description: 'Service after EOOW',
    requirements: [
      {
        label: 'Seagoing Service as EOOW',
        value: '6 months',
        details: [
          'While serving as SV EOOW (<9,000 kW, <3,000 GT)',
          'Min 6 months seagoing on vessels ≥350 kW',
          'In full charge of the watch or with designated UMS duties',
        ],
      },
    ],
    notes: [
      'Requires Chief Engineer Statutory and Operational Requirements exam',
      'Requires Auxiliary Equipment Part II exam',
      'MCA oral examination for Chief Engineer <3,000 kW, <500 GT, III/3',
    ],
  },
  {
    id: 'chief-engineer-sv-3000gt',
    title: 'Chief Engineer (SV) <3,000 GT, <9,000 kW',
    regulation: 'STCW III/2, VII',
    description: 'Service after EOOW',
    requirements: [
      {
        label: 'Seagoing Service as EOOW',
        value: '12 months',
        details: [
          'While serving as SV EOOW (<9,000 kW, <3,000 GT)',
          '6 months on vessels ≥750 kW',
          '6 months on vessels ≥350 kW',
          'In full charge of the watch or with designated UMS duties',
        ],
      },
    ],
    notes: [
      'Requires Auxiliary Equipment Part II, Chief Engineer Statutory & Operational Requirements, Applied Marine Engineering exams',
      'Requires General Engineering Science I & II OR Diploma in Maritime Studies (SV Engineer + SV Chief Engineer)',
      'Requires HELM (Management)',
      'MCA oral examination for Chief Engineer <9,000 kW, <3,000 GT, III/2',
    ],
  },
];

// ── USCG pathways ────────────────────────────────────────────────────
// Source: 46 CFR Part 11 (Requirements for Officer Endorsements), current
// text as amended by USCG-2021-0097 (89 FR 93070, 25 Nov 2024) and
// USCG-2021-0834 (89 FR 102334, 17 Dec 2024). Verified against eCFR.
//
// Service is expressed here in creditable DAYS so it can be compared against
// logged sea time. The conversions come from 46 CFR 10.107:
//   1 day   = 8 hours of watchstanding or day-working, excluding overtime
//             (on vessels authorised to run a two-watch system under
//              46 U.S.C. 8104, a 12-hour day may count as 1.5 days)
//   1 month = 30 days
//   1 year  = 360 days
//
// Tonnage: under 46 CFR 11.211(h), a vessel measured only under the
// Convention (ITC) scheme is credited as Gross Register Tonnage.

export const USCG_DAYS_PER_MONTH = 30;
export const USCG_DAYS_PER_YEAR = 360;

/** Categories used to group the USCG list in the requirements screen. */
export const USCG_DECK_CATEGORIES = [
  'Ocean & Near-Coastal',
  'Great Lakes & Inland',
  'Rivers',
  'Towing Vessels',
  'Uninspected Passenger Vessels',
  'Offshore Supply Vessels',
  'Fishing Industry Vessels',
  'Mobile Offshore Drilling Units',
  'STCW Deck',
] as const;

export const USCG_ENGINEERING_CATEGORIES = [
  'National Engineer',
  'Designated Duty Engineer',
  'Offshore Supply Vessels',
  'Fishing Industry Vessels',
  'Mobile Offshore Drilling Units',
  'STCW Engineer',
] as const;

const USCG_DECK_REQUIREMENTS: MCARequirement[] = [
  // ── Ocean & near-coastal, unlimited tonnage ──────────────────────
  {
    id: 'uscg-master-onc-unlimited',
    title: 'Master, Oceans or Near-Coastal, Unlimited Tonnage',
    regulation: '46 CFR 11.404',
    description: 'Top national deck endorsement for ocean and near-coastal service',
    category: 'Ocean & Near-Coastal',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Chief Mate',
        value: '360 days (1 year)',
        details: [
          'As Chief Mate on ocean self-propelled vessels',
          'Alternative: 360 days on deck while holding Chief Mate (unlimited), of which at least 180 days as Chief Mate',
          'In that alternative, service as Second Mate, Third Mate or OICNW counts two-for-one',
        ],
      },
    ],
    notes: [
      'Holders of Master (Great Lakes and inland) or Master (inland) unlimited can cross over with 720 days under the authority of that credential plus the prescribed examination',
      'Great Lakes service credits day for day; other inland waters up to 50 percent of the total required service',
      'Supports an STCW endorsement as Master of vessels 3,000 GT or more under 46 CFR 11.305',
    ],
  },
  {
    id: 'uscg-chief-mate-onc-unlimited',
    title: 'Chief Mate, Oceans or Near-Coastal, Unlimited Tonnage',
    regulation: '46 CFR 11.405',
    description: 'Service as OICNW while holding Second Mate',
    category: 'Ocean & Near-Coastal',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '360 days (1 year)',
        details: [
          'On ocean self-propelled vessels',
          'While holding an MMC endorsement as Second Mate',
        ],
      },
    ],
    notes: [
      'Great Lakes service credits day for day; other inland waters up to 50 percent',
      'Supports an STCW endorsement as Chief Mate of vessels 3,000 GT or more under 46 CFR 11.307',
    ],
  },
  {
    id: 'uscg-second-mate-onc-unlimited',
    title: 'Second Mate, Oceans or Near-Coastal, Unlimited Tonnage',
    regulation: '46 CFR 11.406',
    description: 'Service as OICNW while holding Third Mate',
    category: 'Ocean & Near-Coastal',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '360 days (1 year)',
        details: [
          'On ocean self-propelled vessels while holding Third Mate',
          'Alternative: 360 days on deck holding Third Mate, of which at least 180 days in charge of a deck watch',
          'In that alternative, service as Boatswain, Able Seafarer or quartermaster counts two-for-one, up to 180 days',
        ],
      },
    ],
    notes: [
      'Great Lakes credits day for day; other inland waters up to 50 percent',
      'Supports an STCW endorsement as OICNW under 46 CFR 11.309',
    ],
  },
  {
    id: 'uscg-third-mate-onc-unlimited',
    title: 'Third Mate, Oceans or Near-Coastal, Unlimited Tonnage',
    regulation: '46 CFR 11.407',
    description: 'Entry-level unlimited deck officer endorsement',
    category: 'Ocean & Near-Coastal',
    totalDays: 1080,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '1,080 days (3 years)',
        details: [
          'On ocean self-propelled vessels',
          'Engine department service credits up to 90 days of this total',
        ],
      },
      {
        label: 'Bridge Watchkeeping',
        value: '180 days (6 months)',
        details: ['Under the supervision of the Master or a qualified officer'],
      },
    ],
    notes: [
      'Alternative routes: graduation from the US Merchant Marine Academy, Coast Guard Academy, Naval Academy or an approved state maritime academy, or an approved Apprentice Mate training programme',
      'Holders of Master (oceans or near-coastal) under 1,600 GRT qualify with 360 days as Master on vessels over 200 GRT',
      'Supports an STCW endorsement as OICNW under 46 CFR 11.309',
    ],
  },

  // ── Ocean & near-coastal, under 1,600 GRT ────────────────────────
  {
    id: 'uscg-master-onc-1600grt',
    title: 'Master, Oceans or Near-Coastal, Under 1,600 GRT',
    regulation: '46 CFR 11.412',
    description: 'Commonly the target for larger yachts and small commercial vessels',
    category: 'Ocean & Near-Coastal',
    totalDays: 1440,
    requirements: [
      {
        label: 'Total Service',
        value: '1,440 days (4 years)',
        details: [
          'On ocean or near-coastal waters',
          'Great Lakes and inland service may substitute for up to 720 days',
        ],
      },
      {
        label: 'Service on Vessels Over 100 GRT',
        value: '720 days (2 years)',
      },
      {
        label: 'Service as Master or Mate',
        value: '720 days (2 years)',
        details: [
          'As Master or Mate of self-propelled vessels, or Master or Mate (Pilot) of Towing Vessels, or an equivalent position while holding that endorsement',
          'At least 360 days of it on vessels over 100 GRT',
        ],
      },
    ],
    notes: [
      'Shorter route: 360 days on vessels over 100 GRT as Master or Mate while holding Mate (oceans) under 1,600 GRT or a towing endorsement',
      'Holders of Chief Mate 1,600 GRT or more are eligible without further examination; Second Mate holders need a limited examination',
      'Supports an STCW endorsement as Master 500 to 3,000 GT under 46 CFR 11.311',
    ],
  },
  {
    id: 'uscg-mate-ocean-1600grt',
    title: 'Mate, Oceans, Under 1,600 GRT',
    regulation: '46 CFR 11.414',
    description: 'Ocean route mate endorsement',
    category: 'Ocean & Near-Coastal',
    totalDays: 1080,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '1,080 days (3 years)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 540 days',
        ],
      },
      {
        label: 'Service on Vessels Over 100 GRT',
        value: '360 days (1 year)',
      },
      {
        label: 'Service as Master or Mate',
        value: '360 days (1 year)',
        details: ['At least 180 days of it on vessels over 100 GRT'],
      },
    ],
    notes: [
      'Alternative: the full 1,080 days on vessels over 100 GRT, including 180 days of bridge watchkeeping under supervision',
      'Supports an STCW endorsement as OICNW under 46 CFR 11.309',
    ],
  },
  {
    id: 'uscg-mate-nc-1600grt',
    title: 'Mate, Near-Coastal, Under 1,600 GRT',
    regulation: '46 CFR 11.416',
    description: 'Near-coastal route mate endorsement',
    category: 'Ocean & Near-Coastal',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (2 years)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 360 days',
        ],
      },
      {
        label: 'Service on Vessels Over 100 GRT',
        value: '360 days (1 year)',
      },
      {
        label: 'Bridge Watchkeeping',
        value: '180 days (6 months)',
        details: ['Under the supervision of the Master or a qualified officer'],
      },
    ],
    notes: ['Supports an STCW endorsement as OICNW under 46 CFR 11.309'],
  },

  // ── Ocean & near-coastal, under 500 GRT ──────────────────────────
  {
    id: 'uscg-master-onc-500grt',
    title: 'Master, Oceans or Near-Coastal, Under 500 GRT',
    regulation: '46 CFR 11.418',
    description: 'The 500-ton Master',
    category: 'Ocean & Near-Coastal',
    totalDays: 1080,
    requirements: [
      {
        label: 'Total Service',
        value: '1,080 days (3 years)',
        details: [
          'On ocean or near-coastal waters',
          'Great Lakes and inland service may substitute for up to 540 days',
        ],
      },
      {
        label: 'Service as Master or Mate',
        value: '720 days (2 years)',
        details: [
          'As Master, Mate or an equivalent position while holding Master, Mate or OUPV',
          'At least 360 days of it on vessels over 50 GRT',
        ],
      },
    ],
    notes: [
      'Shorter route: 360 days on vessels over 50 GRT as Master or Mate while holding Mate (oceans) under 500 GRT',
      'Towing route: holders of Master or Mate (Pilot) of Towing Vessels with an ocean or near-coastal route qualify after 360 days in that capacity plus a limited examination',
      'Supports STCW endorsements under 46 CFR 11.307, 11.309, 11.311, 11.313 and 11.315',
    ],
  },
  {
    id: 'uscg-mate-ocean-500grt',
    title: 'Mate, Oceans, Under 500 GRT',
    regulation: '46 CFR 11.420',
    description: 'Ocean route mate endorsement',
    category: 'Ocean & Near-Coastal',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (2 years)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 360 days',
        ],
      },
      {
        label: 'Service as Master or Mate',
        value: '360 days (1 year)',
        details: [
          'While holding Master, Mate or OUPV',
          'At least 180 days of it on vessels over 50 GRT',
        ],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.309, 11.317, 11.319 and 11.321'],
  },
  {
    id: 'uscg-mate-nc-500grt',
    title: 'Mate, Near-Coastal, Under 500 GRT',
    regulation: '46 CFR 11.421',
    description: 'Near-coastal route mate endorsement',
    category: 'Ocean & Near-Coastal',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (2 years)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 360 days',
        ],
      },
      {
        label: 'Service on Vessels Over 50 GRT',
        value: '360 days (1 year)',
      },
      {
        label: 'Bridge Watchkeeping',
        value: '90 days (3 months)',
        details: ['Under supervision, on vessels over 50 GRT'],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.309, 11.317, 11.319 and 11.321'],
  },

  // ── Ocean & near-coastal, under 200 GRT (the "200-ton" group) ────
  {
    id: 'uscg-master-ocean-200grt',
    title: 'Master, Oceans, Under 200 GRT',
    regulation: '46 CFR 11.424',
    description: 'The 200-ton Master with an ocean route',
    category: 'Ocean & Near-Coastal',
    totalDays: 1080,
    requirements: [
      {
        label: 'Total Service',
        value: '1,080 days (3 years)',
        details: [
          'On ocean or near-coastal waters',
          'Great Lakes and inland service may substitute for up to 540 days',
        ],
      },
      {
        label: 'Service as Master or Mate',
        value: '720 days (2 years)',
        details: ['As Master, Mate or an equivalent position while holding Master, Mate or OUPV'],
      },
    ],
    notes: [
      'Alternative: 720 days as Master or Mate of ocean or near-coastal towing vessels',
      'An examination is required',
      'A sail or auxiliary sail endorsement needs a further 360 days of sail service, which may pre-date the endorsement',
      'The endorsement is issued at 25, 50, 100 or 200 GRT under the tonnage formula in 46 CFR 11.422',
      'Supports STCW endorsements under 46 CFR 11.315, 11.317, 11.319 and 11.321',
    ],
  },
  {
    id: 'uscg-master-nc-200grt',
    title: 'Master, Near-Coastal, Under 200 GRT',
    regulation: '46 CFR 11.426',
    description: 'The 200-ton Master. The most common licence for yacht and small passenger vessel captains',
    category: 'Ocean & Near-Coastal',
    totalDays: 720,
    requirements: [
      {
        label: 'Total Service',
        value: '720 days (2 years)',
        details: [
          'On ocean or near-coastal waters',
          'Great Lakes and inland service may substitute for up to 360 days',
        ],
      },
      {
        label: 'Service as Master or Mate',
        value: '360 days (1 year)',
        details: ['As Master, Mate or an equivalent position while holding Master, Mate or OUPV'],
      },
    ],
    notes: [
      'Alternative: 360 days as Master or Mate of Towing Vessels on ocean or near-coastal routes',
      'An examination is required',
      'A sail or auxiliary sail endorsement needs a further 360 days of sail service, which may pre-date the endorsement',
      'The endorsement is issued at 25, 50, 100 or 200 GRT under the tonnage formula in 46 CFR 11.422, based on the tonnage of the vessels the service was gained on',
      'Holders are treated as compliant with the STCW Convention while operating within the limits of the endorsement',
    ],
  },
  {
    id: 'uscg-mate-ocean-200grt',
    title: 'Mate, Oceans, Under 200 GRT',
    regulation: '46 CFR 11.425',
    description: 'Ocean route mate endorsement under 200 GRT',
    category: 'Ocean & Near-Coastal',
    totalDays: 360,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '360 days (12 months)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 180 days',
        ],
      },
    ],
    notes: [
      'Alternative: 90 days of deck service while holding Master of inland vessels under 200 GRT',
      'OUPV holders with a near-coastal route can add this endorsement by examination on small passenger vessel rules',
      'Engine room service on vessels of 200 GRT or less credits up to 90 days of the deck requirement (46 CFR 11.422(d))',
      'A sail or auxiliary sail endorsement needs 180 days of sail deck service',
      'Supports STCW endorsements under 46 CFR 11.319 and 11.321',
    ],
  },
  {
    id: 'uscg-mate-nc-200grt',
    title: 'Mate, Near-Coastal, Under 200 GRT',
    regulation: '46 CFR 11.427',
    description: 'Near-coastal route mate endorsement under 200 GRT',
    category: 'Ocean & Near-Coastal',
    totalDays: 360,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '360 days (12 months)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 180 days',
        ],
      },
    ],
    notes: [
      'Alternative: 90 days of deck service while holding Master of inland vessels under 200 GRT',
      'OUPV holders with a near-coastal route can add this endorsement by examination on small passenger vessel rules',
      'Engine room service on vessels of 200 GRT or less credits up to 90 days of the deck requirement (46 CFR 11.422(d))',
      'A tonnage endorsement of 100 GRT or more needs the additional examination topics in 46 CFR part 11 subpart I',
      'Holders are treated as compliant with the STCW Convention while operating within the limits of the endorsement',
    ],
  },

  // ── Ocean & near-coastal, under 100 GRT ──────────────────────────
  {
    id: 'uscg-master-nc-100grt',
    title: 'Master, Near-Coastal, Under 100 GRT',
    regulation: '46 CFR 11.428',
    description: 'Domestic near-coastal voyages on seagoing vessels under 100 GRT',
    category: 'Ocean & Near-Coastal',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (2 years)',
        details: [
          'On self-propelled vessels on ocean or near-coastal waters',
          'Great Lakes and inland service may substitute for up to 360 days',
        ],
      },
    ],
    notes: [
      'A sail or auxiliary sail endorsement needs 360 days of sail service, which may pre-date the credential',
      'Issued in tonnage increments under 46 CFR 11.422',
      'Holders are treated as compliant with the STCW Convention while operating within the limits of the endorsement',
    ],
  },
  {
    id: 'uscg-limited-master-nc-100grt',
    title: 'Limited Master, Near-Coastal, Under 100 GRT',
    regulation: '46 CFR 11.429',
    description: 'Restricted endorsement for yacht clubs, marinas, camps and educational institutions',
    category: 'Ocean & Near-Coastal',
    totalDays: 120,
    requirements: [
      {
        label: 'Service',
        value: '120 days (4 months)',
        details: ['On any waters, operating the type of vessel the endorsement is requested for'],
      },
    ],
    notes: [
      'Limited to the specific activity and the locality of the employer',
      'Requires an approved safe boating course completed within the 5 years before application',
      'Requires a limited examination appropriate to the activity and route',
      'A sail or auxiliary sail endorsement needs 120 days of sail service',
    ],
  },

  // ── Great Lakes & inland ─────────────────────────────────────────
  {
    id: 'uscg-master-gl-inland-unlimited',
    title: 'Master, Great Lakes and Inland, Unlimited Tonnage',
    regulation: '46 CFR 11.433',
    description: 'Unlimited tonnage on the Great Lakes and inland waters',
    category: 'Great Lakes & Inland',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Mate or First-Class Pilot',
        value: '360 days (1 year)',
        details: [
          'Acting as First Mate on Great Lakes vessels of 1,600 GRT or more, while holding Mate inland or First-Class Pilot unlimited',
          'Alternative: 720 days as Master of vessels of 1,600 GRT or more on inland waters excluding the Great Lakes',
          'Alternative: 360 days on the Great Lakes holding Mate or First-Class Pilot 1,600 GRT or more, of which at least 180 days as First Mate, with Second Mate service two-for-one up to 180 days',
        ],
      },
    ],
  },
  {
    id: 'uscg-master-inland-unlimited',
    title: 'Master, Inland, Unlimited Tonnage',
    regulation: '46 CFR 11.435',
    description: 'Inland waters excluding the Great Lakes',
    category: 'Great Lakes & Inland',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Mate or First-Class Pilot',
        value: '360 days (1 year)',
        details: [
          'On Great Lakes or inland self-propelled vessels of 1,600 GRT or more, while holding Mate inland or First-Class Pilot unlimited',
          'Alternative: 720 days of bridge watchkeeping under supervision while holding Mate or First-Class Pilot',
        ],
      },
    ],
  },
  {
    id: 'uscg-mate-gl-inland-unlimited',
    title: 'Mate, Great Lakes and Inland, Unlimited Tonnage',
    regulation: '46 CFR 11.437',
    description: 'Entry-level unlimited endorsement for the Great Lakes and inland waters',
    category: 'Great Lakes & Inland',
    totalDays: 1080,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '1,080 days (3 years)',
        details: [
          'On self-propelled vessels',
          'Engine department service credits up to 180 days of this total',
        ],
      },
      {
        label: 'Service on Inland Waters',
        value: '90 days (3 months)',
      },
      {
        label: 'Bridge Watchkeeping',
        value: '180 days (6 months)',
        details: ['Under the supervision of the Master or a qualified officer'],
      },
    ],
    notes: [
      'Alternatives: graduation from the deck class of the Great Lakes Maritime Academy, or 360 days as Master on vessels of 200 GRT or more while holding Master (Great Lakes and inland) under 1,600 GRT',
    ],
  },
  {
    id: 'uscg-master-gl-inland-1600grt',
    title: 'Master, Great Lakes and Inland, Under 1,600 GRT',
    regulation: '46 CFR 11.442',
    description: 'Great Lakes and inland waters under 1,600 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 1080,
    requirements: [
      {
        label: 'Total Service',
        value: '1,080 days (3 years)',
      },
      {
        label: 'Service on Vessels of 100 GRT or More',
        value: '540 days (18 months)',
      },
      {
        label: 'Service as Master or Mate',
        value: '360 days (1 year)',
        details: [
          'On vessels of 100 GRT or more, while holding Master, Mate or Master of Towing Vessels',
        ],
      },
    ],
    notes: [
      'Shorter route: 180 days as operator on vessels of 100 GRT or more while holding Master of Towing Vessels',
    ],
  },
  {
    id: 'uscg-mate-gl-inland-1600grt',
    title: 'Mate, Great Lakes and Inland, Under 1,600 GRT',
    regulation: '46 CFR 11.444',
    description: 'Great Lakes and inland waters under 1,600 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (2 years)',
        details: ['On self-propelled vessels'],
      },
      {
        label: 'Service on Vessels of 100 GRT or More',
        value: '360 days (1 year)',
      },
      {
        label: 'Bridge Watchkeeping',
        value: '180 days (6 months)',
        details: ['Under supervision, on vessels of 100 GRT or more'],
      },
    ],
    notes: [
      'Alternative: 360 days as Master of vessels under 200 GRT or OUPV on vessels of 50 GRT or more while holding that endorsement',
      'Alternative: 180 days as Mate (Pilot) of Towing Vessels on vessels of 100 GRT or more',
    ],
  },
  {
    id: 'uscg-master-gl-inland-500grt',
    title: 'Master, Great Lakes and Inland, Under 500 GRT',
    regulation: '46 CFR 11.446',
    description: 'Great Lakes and inland waters under 500 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 1080,
    requirements: [
      {
        label: 'Total Service',
        value: '1,080 days (3 years)',
      },
      {
        label: 'Service as Master or Mate',
        value: '360 days (1 year)',
        details: [
          'On vessels of 50 GRT or more, while holding Master, Mate or OUPV',
        ],
      },
    ],
    notes: [
      'Towing route: holders of Master of Towing Vessels qualify after 180 days as Master of Towing Vessels plus a limited examination, on a total of 1,260 days of service, of which 720 days must be while holding Master or Mate (Pilot) of Towing Vessels, or Mate',
    ],
  },
  {
    id: 'uscg-mate-gl-inland-500grt',
    title: 'Mate, Great Lakes and Inland, Under 500 GRT',
    regulation: '46 CFR 11.448',
    description: 'Great Lakes and inland waters under 500 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (2 years)',
        details: ['On self-propelled vessels'],
      },
      {
        label: 'Service on Vessels of 50 GRT or More',
        value: '360 days (1 year)',
      },
      {
        label: 'Bridge Watchkeeping',
        value: '90 days (3 months)',
        details: ['Under supervision, on vessels of 50 GRT or more'],
      },
    ],
  },
  {
    id: 'uscg-master-gl-inland-200grt',
    title: 'Master, Great Lakes and Inland, Under 200 GRT',
    regulation: '46 CFR 11.452',
    description: 'Great Lakes and inland waters under 200 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 360,
    requirements: [
      {
        label: 'Total Service',
        value: '360 days (1 year)',
      },
      {
        label: 'Service as Master or Mate',
        value: '180 days (6 months)',
        details: [
          'While holding Master or Mate of self-propelled vessels, Master or Mate (Pilot) of Towing Vessels, or OUPV',
        ],
      },
    ],
    notes: [
      'Great Lakes authority needs 90 days of the service on Great Lakes waters, otherwise the endorsement is limited to inland waters excluding the Great Lakes',
      'A sail or auxiliary sail endorsement needs 180 days of sail service',
    ],
  },
  {
    id: 'uscg-mate-gl-inland-200grt',
    title: 'Mate, Great Lakes and Inland, Under 200 GRT',
    regulation: '46 CFR 11.454',
    description: 'Great Lakes and inland waters under 200 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 180,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '180 days (6 months)',
        details: ['On self-propelled vessels'],
      },
    ],
    notes: [
      'Great Lakes authority needs 90 days of the service on Great Lakes waters, otherwise the endorsement is limited to inland waters excluding the Great Lakes',
      'A sail or auxiliary sail endorsement needs 90 days of sail service',
      'Inland OUPV holders can add this endorsement by examination on small passenger vessel rules',
      'A tonnage endorsement of 100 GRT or more needs the additional examination topics in subpart I',
    ],
  },
  {
    id: 'uscg-master-gl-inland-100grt',
    title: 'Master, Great Lakes and Inland, Under 100 GRT',
    regulation: '46 CFR 11.455',
    description: 'Great Lakes and inland waters under 100 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 360,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '360 days (1 year)',
        details: ['On self-propelled, sail or auxiliary sail vessels'],
      },
    ],
    notes: [
      'Great Lakes authority needs 90 days of the service on Great Lakes waters',
      'A sail or auxiliary sail endorsement needs 180 days of sail service',
      'Issued in tonnage increments under 46 CFR 11.422',
    ],
  },
  {
    id: 'uscg-limited-master-gl-inland-100grt',
    title: 'Limited Master, Great Lakes and Inland, Under 100 GRT',
    regulation: '46 CFR 11.456',
    description: 'Restricted endorsement for camps, educational institutions, yacht clubs and marinas',
    category: 'Great Lakes & Inland',
    totalDays: 120,
    requirements: [
      {
        label: 'Service',
        value: '120 days (4 months)',
        details: ['Operating the type of vessel the endorsement is requested for'],
      },
    ],
    notes: [
      'Limited to the specific activity and the locality of the employer',
      'Requires an approved safe boating course completed within the 5 years before application',
      'Requires a limited examination appropriate to the activity and route',
    ],
  },
  {
    id: 'uscg-master-inland-100grt',
    title: 'Master, Inland, Under 100 GRT',
    regulation: '46 CFR 11.457',
    description: 'Inland waters under 100 GRT',
    category: 'Great Lakes & Inland',
    totalDays: 360,
    requirements: [
      {
        label: 'Service',
        value: '360 days (1 year)',
        details: ['On any waters'],
      },
    ],
    notes: [
      'Raising the tonnage limitation above 100 GRT needs the subpart I examination topics plus the experience in 46 CFR 11.452(a)',
      'A sail or auxiliary sail endorsement needs 180 days of sail service',
      'Issued in tonnage increments under 46 CFR 11.422',
    ],
  },

  // ── Rivers ───────────────────────────────────────────────────────
  {
    id: 'uscg-master-mate-rivers',
    title: 'Master or Mate, Rivers',
    regulation: '46 CFR 11.459',
    description: 'River route endorsements, mapped onto the inland requirements',
    category: 'Rivers',
    requirements: [
      {
        label: 'Unlimited Tonnage',
        value: '360 days (1 year)',
        details: ['Same service requirements as Master of inland self-propelled vessels of unlimited tonnage (46 CFR 11.435)'],
      },
      {
        label: '25 to 1,600 GRT',
        value: 'As per the matching Great Lakes and inland endorsement',
        details: [
          'The same service requirements as the corresponding tonnage Great Lakes and inland endorsement',
          'Great Lakes service is not required',
        ],
      },
    ],
  },

  // ── Towing vessels ───────────────────────────────────────────────
  {
    id: 'uscg-master-towing',
    title: 'Master of Towing Vessels',
    regulation: '46 CFR 11.464',
    description: 'Oceans, near-coastal, Great Lakes and inland, or Western Rivers',
    category: 'Towing Vessels',
    totalDays: 1440,
    requirements: [
      {
        label: 'Total Service',
        value: '1,440 days (48 months)',
      },
      {
        label: 'Service as Mate (Pilot) of Towing Vessels',
        value: '540 days (18 months)',
      },
      {
        label: 'Service on the Particular Route',
        value: '90 days (3 months)',
      },
    ],
    notes: [
      'The same figures apply to each route: oceans, near-coastal, Great Lakes and inland, and Western Rivers',
      'An ocean endorsement carries near-coastal and Great Lakes and inland as subordinate routes; near-coastal carries Great Lakes and inland',
      'Western Rivers service needs 90 days of observation and training plus a Western Rivers endorsement',
      'Holders of Master of self-propelled vessels over 200 GRT can operate towing vessels with 30 days of training and observation plus a completed TOAR or an approved course',
      'Supports STCW endorsements under 46 CFR 11.307, 11.311, 11.313 and 11.315',
    ],
  },
  {
    id: 'uscg-master-towing-limited',
    title: 'Master of Towing Vessels, Limited',
    regulation: '46 CFR 11.464(c)',
    description: 'Limited local area endorsement',
    category: 'Towing Vessels',
    totalDays: 1080,
    requirements: [
      {
        label: 'Total Service',
        value: '1,080 days (36 months)',
      },
      {
        label: 'Service as Apprentice Mate of Towing, Limited',
        value: '540 days (18 months)',
      },
      {
        label: 'Service on the Particular Route',
        value: '90 days (3 months)',
      },
    ],
    notes: [
      'A TOAR or an approved course is required',
      'Holders of Mate (Pilot) of Towing Vessels can add this endorsement for a limited local area within their current route',
    ],
  },
  {
    id: 'uscg-mate-pilot-towing',
    title: 'Mate (Pilot) of Towing Vessels',
    regulation: '46 CFR 11.465',
    description: 'Oceans, near-coastal, Great Lakes and inland, or Western Rivers',
    category: 'Towing Vessels',
    totalDays: 900,
    requirements: [
      {
        label: 'Total Service',
        value: '900 days (30 months)',
      },
      {
        label: 'Service as Apprentice Mate of Towing Vessels',
        value: '360 days (12 months)',
        details: ['May be reduced by the time credited in the approval letter for a completed Coast Guard approved training programme'],
      },
      {
        label: 'Service on the Particular Route',
        value: '90 days (3 months)',
      },
    ],
    notes: [
      'A TOAR or an approved course is required',
      'On all inland routes and Western Rivers, Pilot of Towing Vessels is equivalent to Mate of Towing Vessels',
      'Holders of any Master endorsement under 200 GRT, other than the Limited Master endorsements, qualify with 1,080 days as Master under that authority, a TOAR, the Apprentice Mate examination and 30 days of training and observation',
      'Supports STCW endorsements under 46 CFR 11.309, 11.317, 11.319 and 11.321',
    ],
  },
  {
    id: 'uscg-apprentice-mate-towing',
    title: 'Apprentice Mate of Towing Vessels',
    regulation: '46 CFR 11.466',
    description: 'Entry point to the towing vessel officer track',
    category: 'Towing Vessels',
    totalDays: 540,
    requirements: [
      {
        label: 'Total Service',
        value: '540 days (18 months)',
      },
      {
        label: 'Service on Towing Vessels',
        value: '360 days (12 months)',
      },
      {
        label: 'Service on the Particular Route',
        value: '90 days (3 months)',
      },
    ],
    notes: [
      'An examination is required, as specified in 46 CFR part 11 subpart I',
      'The same figures apply to every route: oceans, near-coastal, Great Lakes, inland and Western Rivers',
      'A restricted Apprentice Mate of Towing Vessels, Limited endorsement is available, with the restriction removed after 90 days of experience on the route',
    ],
  },

  // ── Uninspected passenger vessels ────────────────────────────────
  {
    id: 'uscg-oupv-nc',
    title: 'OUPV (Six-Pack), Near-Coastal',
    regulation: '46 CFR 11.467',
    description: 'Uninspected passenger vessels under 100 GRT carrying six or fewer passengers',
    category: 'Uninspected Passenger Vessels',
    totalDays: 360,
    requirements: [
      {
        label: 'Experience Operating Vessels',
        value: '360 days (12 months)',
      },
      {
        label: 'Service on Ocean or Near-Coastal Waters',
        value: '90 days (3 months)',
      },
    ],
    notes: [
      'A near-coastal OUPV is limited to domestic waters not more than 100 miles offshore, plus the Great Lakes and all inland waters',
      'This is the usual first credential on the route to the 200-ton Master, and OUPV service counts toward it',
    ],
  },
  {
    id: 'uscg-oupv-gl-inland',
    title: 'OUPV (Six-Pack), Great Lakes and Inland',
    regulation: '46 CFR 11.467(d)',
    description: 'Uninspected passenger vessels on the Great Lakes and inland waters',
    category: 'Uninspected Passenger Vessels',
    totalDays: 360,
    requirements: [
      {
        label: 'Service on Great Lakes or Inland Waters',
        value: '360 days (12 months)',
      },
      {
        label: 'Service Operating Vessels on the Great Lakes',
        value: '90 days (3 months)',
      },
    ],
  },
  {
    id: 'uscg-oupv-inland',
    title: 'OUPV (Six-Pack), Inland',
    regulation: '46 CFR 11.467(e)',
    description: 'Uninspected passenger vessels on inland waters excluding the Great Lakes',
    category: 'Uninspected Passenger Vessels',
    totalDays: 360,
    requirements: [
      {
        label: 'Experience Operating Vessels',
        value: '360 days (12 months)',
      },
    ],
    notes: [
      'A limited OUPV for camps, yacht clubs, educational institutions and marinas needs 90 days of service, an approved safe boating course and a limited examination',
      'A restricted OUPV for specific inland bodies of water needs 90 days of service on each body of water and an appropriate examination',
    ],
  },

  // ── Offshore supply vessels ──────────────────────────────────────
  {
    id: 'uscg-master-osv',
    title: 'Master-OSV',
    regulation: '46 CFR 11.493',
    description: 'Master of offshore supply vessels',
    category: 'Offshore Supply Vessels',
    totalDays: 720,
    requirements: [
      {
        label: 'Service as Mate, Chief Mate or Master',
        value: '720 days (24 months)',
        details: [
          'On ocean, near-coastal or Great Lakes self-propelled vessels of more than 100 GRT',
          'At least half of it as Chief Mate',
        ],
      },
    ],
    notes: [
      'Under 1,600 GRT / 3,000 GT: inland service may substitute for up to 50 percent of the requirement',
      'At 1,600 GRT / 3,000 GT or more: the Chief Mate half must be gained on vessels of that size, otherwise a tonnage limitation applies with a floor of 2,000 GRT and a ceiling of 10,000 GRT',
      'Supports STCW endorsements under 46 CFR 11.305 and 11.311',
    ],
  },
  {
    id: 'uscg-chief-mate-osv',
    title: 'Chief Mate-OSV',
    regulation: '46 CFR 11.495',
    description: 'Chief Mate of offshore supply vessels',
    category: 'Offshore Supply Vessels',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Mate, Chief Mate or Master',
        value: '360 days (12 months)',
        details: ['On ocean, near-coastal or Great Lakes self-propelled vessels of more than 100 GRT'],
      },
    ],
    notes: [
      'Under 1,600 GRT / 3,000 GT: inland service may substitute for up to 50 percent',
      'At 1,600 GRT / 3,000 GT or more: at least half the service must be on vessels of that size, otherwise a tonnage limitation applies with a floor of 2,000 GRT',
      'Supports STCW endorsements under 46 CFR 11.307 and 11.313',
    ],
  },
  {
    id: 'uscg-mate-osv',
    title: 'Mate-OSV',
    regulation: '46 CFR 11.497',
    description: 'Mate of offshore supply vessels',
    category: 'Offshore Supply Vessels',
    totalDays: 720,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '720 days (24 months)',
        details: [
          'On ocean or near-coastal self-propelled, sail or auxiliary sail vessels',
          'Great Lakes and inland service may substitute for up to 360 days',
        ],
      },
      {
        label: 'Service on Vessels Over 100 GRT',
        value: '360 days (1 year)',
      },
    ],
    notes: [
      'Alternative: 360 days as part of an approved or accepted Mate-OSV training programme',
      'Supports an STCW endorsement as OICNW under 46 CFR 11.309',
    ],
  },

  // ── Fishing industry vessels ─────────────────────────────────────
  {
    id: 'uscg-master-fishing',
    title: 'Master of Uninspected Fishing Industry Vessels',
    regulation: '46 CFR 11.462(c)',
    description: 'Documented fishing industry vessels navigating the high seas',
    category: 'Fishing Industry Vessels',
    totalDays: 1440,
    requirements: [
      {
        label: 'Total Service',
        value: '1,440 days (4 years)',
        details: [
          'On ocean or near-coastal routes',
          'Great Lakes and inland service may substitute for up to 720 days',
        ],
      },
      {
        label: 'Service as Master or Mate',
        value: '360 days (1 year)',
        details: ['While holding Master or Mate of self-propelled vessels, Master or Mate (Pilot) of Towing Vessels, or OUPV'],
      },
    ],
    notes: [
      'Under 500 GRT: at least 720 days, including the 360 days as Master or Mate, on vessels of 50 GRT or more',
      'Under 1,600 GRT: at least 720 days, including the 360 days as Master or Mate, on vessels of 100 GRT or more',
      'Above 1,600 GRT and up to 5,000 GRT the tonnage limit is computed from the tonnage the service was gained on, in multiples of 1,000 GRT',
      'Does not apply to wooden ships of primitive build, unrigged vessels, or vessels under 200 GRT',
    ],
  },
  {
    id: 'uscg-mate-fishing',
    title: 'Mate of Uninspected Fishing Industry Vessels',
    regulation: '46 CFR 11.462(d)',
    description: 'Documented fishing industry vessels navigating the high seas',
    category: 'Fishing Industry Vessels',
    totalDays: 1080,
    requirements: [
      {
        label: 'Total Service',
        value: '1,080 days (3 years)',
        details: [
          'On ocean or near-coastal routes',
          'Great Lakes and inland service may substitute for up to 540 days',
        ],
      },
    ],
    notes: [
      'Under 500 GRT: at least 360 days on vessels of 50 GRT or more',
      'Under 1,600 GRT: at least 360 days on vessels of 100 GRT or more',
      'Above 1,600 GRT and up to 5,000 GRT the tonnage limit is computed from the tonnage the service was gained on',
      'Does not apply to wooden ships of primitive build, unrigged vessels, or vessels under 200 GRT',
    ],
  },

  // ── Mobile offshore drilling units ───────────────────────────────
  {
    id: 'uscg-oim',
    title: 'Offshore Installation Manager (OIM)',
    regulation: '46 CFR 11.470',
    description: 'Unrestricted, surface units and bottom bearing units, on location or underway',
    category: 'Mobile Offshore Drilling Units',
    totalDays: 1440,
    requirements: [
      {
        label: 'Employment Assigned to MODUs',
        value: '1,440 days (4 years)',
        details: [
          'Including 360 days as Driller, Assistant Driller, Toolpusher, Assistant Toolpusher, Barge Supervisor, Mechanical Supervisor, Electrician, Crane Operator, Ballast Control Operator or an equivalent supervisory position',
          'For unrestricted and surface unit endorsements, at least 14 days of that supervisory service must be on surface units',
        ],
      },
      {
        label: 'Degree Route',
        value: '168 days',
        details: [
          'An ABET accredited engineering or engineering technology degree, plus 168 days in the supervisory positions listed above',
          'At least 14 days of that service on surface units for unrestricted and surface unit endorsements',
        ],
      },
      {
        label: 'Route for Unlimited Master or Chief Mate Holders',
        value: '84 days surface, 28 days bottom bearing',
        details: ['Plus the required training courses and company recommendation'],
      },
    ],
    notes: [
      'Five endorsements are issued: OIM Unrestricted, OIM Surface Units on Location, OIM Surface Units Underway, OIM Bottom Bearing Units on Location and OIM Bottom Bearing Units Underway',
      'Requires an approved stability course, a survival suit and survival craft course, and firefighting training',
      'Underway and unrestricted endorsements also need a senior company official recommendation covering supervised rig moves, one of them within the year before application',
    ],
  },
  {
    id: 'uscg-barge-supervisor',
    title: 'Barge Supervisor',
    regulation: '46 CFR 11.472',
    description: 'MODU barge supervisor endorsement',
    category: 'Mobile Offshore Drilling Units',
    totalDays: 1080,
    requirements: [
      {
        label: 'Employment Assigned to MODUs',
        value: '1,080 days (3 years)',
        details: [
          'Including 168 days as Driller, Assistant Driller, Toolpusher, Assistant Toolpusher, Mechanic, Electrician, Crane Operator, Subsea Specialist, Ballast Control Operator or an equivalent supervisory position',
          'At least 84 days of that service as Ballast Control Operator or Barge Supervisor trainee',
        ],
      },
    ],
    notes: [
      'Degree route: an ABET accredited engineering degree plus 168 days in those positions, including 84 days as BCO or Barge Supervisor trainee',
      'Holders of an unlimited Master or Mate endorsement need only 84 days as BCO or Barge Supervisor trainee, plus the required courses',
    ],
  },
  {
    id: 'uscg-ballast-control-operator',
    title: 'Ballast Control Operator (BCO)',
    regulation: '46 CFR 11.474',
    description: 'MODU ballast control operator endorsement',
    category: 'Mobile Offshore Drilling Units',
    totalDays: 360,
    requirements: [
      {
        label: 'Employment Assigned to MODUs',
        value: '360 days (1 year)',
        details: ['Including at least 28 days as a trainee supervised by an endorsed Ballast Control Operator'],
      },
    ],
    notes: [
      'Degree route: an ABET accredited engineering degree plus 28 days of supervised trainee service',
      'Holders of an unlimited Master, Mate, Chief Engineer or Assistant Engineer endorsement need only the 28 days of trainee service plus the required courses',
      'Requires an approved stability course, a survival suit and survival craft course, and firefighting training',
      'When assigned to a MODU, a BCO is equivalent to a Mate on a conventional vessel',
    ],
  },

  // ── STCW deck endorsements ───────────────────────────────────────
  {
    id: 'uscg-stcw-master-3000gt',
    title: 'STCW Master, 3,000 GT or More (Management Level)',
    regulation: '46 CFR 11.305',
    description: 'STCW Regulation II/2',
    category: 'STCW Deck',
    totalDays: 1080,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '1,080 days (36 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Reducible to 720 days if at least 360 days were served as Chief Mate',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 90 days',
        ],
      },
    ],
    notes: [
      'Requires the standard of competence in Section A-II/2 of the STCW Code',
      'Requires approved training including leadership and managerial skills, and bridge resource management',
      'Holders of STCW Master 500 to 3,000 GT can step up with 180 days of sea service under that endorsement',
    ],
  },
  {
    id: 'uscg-stcw-chief-mate-3000gt',
    title: 'STCW Chief Mate, 3,000 GT or More (Management Level)',
    regulation: '46 CFR 11.307',
    description: 'STCW Regulation II/2',
    category: 'STCW Deck',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '360 days (12 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 30 days',
        ],
      },
    ],
    notes: [
      'Requires the standard of competence in Section A-II/2 of the STCW Code',
      'Holders of STCW Chief Mate 500 to 3,000 GT can step up with 180 days of sea service under that endorsement',
    ],
  },
  {
    id: 'uscg-stcw-oicnw-500gt',
    title: 'STCW OICNW, 500 GT or More (Operational Level)',
    regulation: '46 CFR 11.309',
    description: 'Officer in Charge of a Navigational Watch, STCW Regulation II/1',
    category: 'STCW Deck',
    totalDays: 1080,
    requirements: [
      {
        label: 'Seagoing Service',
        value: '1,080 days (36 months)',
        details: [
          'In the deck department on vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Alternative: 360 days of seagoing service as part of an approved training programme meeting Section A-II/1',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 90 days',
        ],
      },
      {
        label: 'Bridge Watchkeeping',
        value: '180 days (6 months)',
        details: ['Supervised by an officer holding an STCW endorsement as Master, Chief Mate, Second Mate or OICNW'],
      },
    ],
    notes: ['Renewal after 1 January 2017 needs current ECDIS training where the vessel is fitted with it'],
  },
  {
    id: 'uscg-stcw-master-500-3000gt',
    title: 'STCW Master, 500 to Under 3,000 GT (Management Level)',
    regulation: '46 CFR 11.311',
    description: 'STCW Regulation II/2',
    category: 'STCW Deck',
    totalDays: 1080,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '1,080 days (36 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Reducible to 720 days if at least 360 days were served as Chief Mate',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 90 days',
        ],
      },
    ],
    notes: ['Requires the standard of competence in Section A-II/2 of the STCW Code'],
  },
  {
    id: 'uscg-stcw-chief-mate-500-3000gt',
    title: 'STCW Chief Mate, 500 to Under 3,000 GT (Management Level)',
    regulation: '46 CFR 11.313',
    description: 'STCW Regulation II/2',
    category: 'STCW Deck',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '360 days (12 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 30 days',
        ],
      },
    ],
  },
  {
    id: 'uscg-stcw-master-under-500gt',
    title: 'STCW Master, Under 500 GT (Management Level)',
    regulation: '46 CFR 11.315',
    description: 'STCW Regulation II/2, unlimited area',
    category: 'STCW Deck',
    totalDays: 1080,
    requirements: [
      {
        label: 'Seagoing Service as OICNW',
        value: '1,080 days (36 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Reducible to 720 days if at least 360 days were served as Chief Mate',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 90 days',
        ],
      },
    ],
  },
  {
    id: 'uscg-stcw-master-under-500gt-nc',
    title: 'STCW Master, Under 500 GT, Near-Coastal (Management Level)',
    regulation: '46 CFR 11.317',
    description: 'STCW Regulation II/3',
    category: 'STCW Deck',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as OICNW',
        value: '360 days (12 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 30 days',
        ],
      },
    ],
    notes: ['Requires the standard of competence in Section A-II/3 of the STCW Code'],
  },
  {
    id: 'uscg-stcw-oicnw-under-500gt',
    title: 'STCW OICNW, Under 500 GT (Operational Level)',
    regulation: '46 CFR 11.319',
    description: 'Officer in Charge of a Navigational Watch, STCW Regulation II/1',
    category: 'STCW Deck',
    totalDays: 1080,
    requirements: [
      {
        label: 'Deck Department Service',
        value: '1,080 days (36 months)',
        details: [
          'On vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Alternative: 360 days of seagoing service as part of an approved training programme meeting Section A-II/1',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 90 days',
        ],
      },
      {
        label: 'Bridge Watchkeeping',
        value: '180 days (6 months)',
        details: [
          'Supervised by an officer holding an STCW endorsement as Master, Chief Mate or OICNW',
          'Service as Boatswain, Able Seafarer or quartermaster while holding a deck watchkeeping rating counts two-for-one, up to 90 days',
        ],
      },
    ],
  },
  {
    id: 'uscg-stcw-oicnw-under-500gt-nc',
    title: 'STCW OICNW, Under 500 GT, Near-Coastal (Operational Level)',
    regulation: '46 CFR 11.321',
    description: 'Officer in Charge of a Navigational Watch, STCW Regulation II/3',
    category: 'STCW Deck',
    totalDays: 720,
    requirements: [
      {
        label: 'Seagoing Service',
        value: '720 days (24 months)',
        details: [
          'In the deck department on vessels operating on oceans, near-coastal waters or the Great Lakes',
          'Inland navigable waters may substitute for up to 50 percent of the total',
          'Engine department service credits up to 90 days',
        ],
      },
      {
        label: 'Approved Training Route',
        value: '360 days (12 months)',
        details: [
          'Completion of approved training for this section plus 360 days of seagoing service',
          'Or completion of an approved training programme that includes the seagoing service the Coast Guard requires',
        ],
      },
    ],
    notes: ['Requires the standard of competence in Section A-II/3 of the STCW Code'],
  },
];

const USCG_ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  // ── National engineer endorsements ───────────────────────────────
  {
    id: 'uscg-chief-engineer',
    title: 'Chief Engineer (Steam, Motor and/or Gas Turbine)',
    regulation: '46 CFR 11.510',
    description: 'Top national engineer endorsement',
    category: 'National Engineer',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as First Assistant Engineer',
        value: '360 days (1 year)',
        details: [
          'Alternative: 360 days while holding First Assistant Engineer, of which at least 180 days as First Assistant Engineer',
          'In that alternative, service as Second or Third Assistant Engineer counts two-for-one, up to 180 days',
        ],
      },
    ],
    notes: [
      'A propulsion power limitation applies unless at least half the qualifying service was on vessels of 4,000 HP / 3,000 kW or more (46 CFR 11.503)',
      'Supports STCW endorsements under 46 CFR 11.325 and 11.331',
    ],
  },
  {
    id: 'uscg-first-assistant-engineer',
    title: 'First Assistant Engineer',
    regulation: '46 CFR 11.512',
    description: 'Steam, motor and/or gas turbine propelled vessels',
    category: 'National Engineer',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Assistant Engineer',
        value: '360 days (1 year)',
        details: [
          'While holding an MMC endorsement as Second Assistant Engineer',
          'Alternative: 360 days as Chief Engineer-Limited plus the prescribed examination',
        ],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.327, 11.331 and 11.333'],
  },
  {
    id: 'uscg-second-assistant-engineer',
    title: 'Second Assistant Engineer',
    regulation: '46 CFR 11.514',
    description: 'Steam, motor and/or gas turbine propelled vessels',
    category: 'National Engineer',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Assistant Engineer',
        value: '360 days (1 year)',
        details: [
          'While holding an MMC endorsement as Third Assistant Engineer',
          'Alternative: 360 days holding Third Assistant Engineer, of which at least 180 days as Third Assistant Engineer, with QMED service counted two-for-one',
        ],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.327, 11.329 and 11.333'],
  },
  {
    id: 'uscg-third-assistant-engineer',
    title: 'Third Assistant Engineer',
    regulation: '46 CFR 11.516',
    description: 'Entry-level unlimited national engineer endorsement',
    category: 'National Engineer',
    totalDays: 1080,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,080 days (3 years)',
        details: ['Deck department service on vessels of 100 GRT or more credits up to 90 days'],
      },
      {
        label: 'Service as QMED',
        value: '720 days (2 years)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: [
      'Alternative routes: a machinist apprenticeship of 3 years plus 360 days in the engine room as Oiler, Boiler Technician, Watertender or Junior Engineer',
      'Alternative routes: graduation from the US Merchant Marine Academy, Coast Guard Academy, Naval Academy or an approved state maritime academy engineering programme',
      'Alternative routes: an ABET accredited marine engineering degree plus 90 days of engine department service, or an ABET accredited mechanical or electrical engineering degree plus 180 days',
      'Alternative routes: an approved Apprentice Engineer training programme, or 360 days as Assistant Engineer-Limited plus the prescribed examination',
    ],
  },
  {
    id: 'uscg-chief-engineer-limited',
    title: 'Chief Engineer-Limited',
    regulation: '46 CFR 11.518',
    description: 'Steam, motor and/or gas turbine propelled vessels, with propulsion power limits',
    category: 'National Engineer',
    totalDays: 1800,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,800 days (5 years)',
      },
      {
        label: 'Service as an Engineer Officer',
        value: '720 days (2 years)',
        details: ['While holding an engineer officer endorsement'],
      },
      {
        label: 'Service as QMED',
        value: '900 days (30 months)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.325 and 11.331'],
  },
  {
    id: 'uscg-assistant-engineer-limited',
    title: 'Assistant Engineer-Limited',
    regulation: '46 CFR 11.522',
    description: 'Steam, motor and/or gas turbine propelled vessels, with propulsion power limits',
    category: 'National Engineer',
    totalDays: 1080,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,080 days (3 years)',
      },
      {
        label: 'Service as QMED',
        value: '540 days (18 months)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.327, 11.329 and 11.333'],
  },

  // ── Designated Duty Engineer ─────────────────────────────────────
  {
    id: 'uscg-dde-unlimited',
    title: 'Designated Duty Engineer, Unlimited Propulsion Power',
    regulation: '46 CFR 11.524(b)(1)',
    description: 'Vessels under 500 GRT, any waters',
    category: 'Designated Duty Engineer',
    totalDays: 1080,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,080 days (3 years)',
      },
      {
        label: 'Service as QMED',
        value: '540 days (18 months)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: [
      'All DDE endorsements are limited to vessels of less than 500 GRT',
      'A DDE-Unlimited may serve on any waters (46 CFR 11.501(c))',
      'An examination is required',
    ],
  },
  {
    id: 'uscg-dde-4000hp',
    title: 'Designated Duty Engineer, Under 4,000 HP / 3,000 kW',
    regulation: '46 CFR 11.524(b)(2)',
    description: 'Vessels under 500 GRT, near-coastal or inland waters',
    category: 'Designated Duty Engineer',
    totalDays: 720,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '720 days (2 years)',
      },
      {
        label: 'Service as QMED',
        value: '360 days (1 year)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: [
      'Limited to vessels of less than 500 GRT on near-coastal or inland waters (46 CFR 11.501(c))',
      'An examination is required',
    ],
  },
  {
    id: 'uscg-dde-1000hp',
    title: 'Designated Duty Engineer, Under 1,000 HP / 750 kW',
    regulation: '46 CFR 11.524(b)(3)',
    description: 'The usual entry-level engineer credential for small vessels',
    category: 'Designated Duty Engineer',
    totalDays: 360,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '360 days (1 year)',
      },
      {
        label: 'Service as QMED',
        value: '180 days (6 months)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: [
      'Limited to vessels of less than 500 GRT on near-coastal or inland waters (46 CFR 11.501(c))',
      'An examination is required',
    ],
  },

  // ── Offshore supply vessels ──────────────────────────────────────
  {
    id: 'uscg-chief-engineer-osv',
    title: 'Chief Engineer-OSV',
    regulation: '46 CFR 11.553',
    description: 'Chief Engineer of offshore supply vessels',
    category: 'Offshore Supply Vessels',
    totalDays: 1440,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,440 days (4 years)',
      },
      {
        label: 'Service as an Engineer Officer',
        value: '360 days (1 year)',
        details: ['While holding an engineer officer endorsement'],
      },
      {
        label: 'Service as QMED',
        value: '720 days (2 years)',
        details: ['As a Qualified Member of the Engine Department or an equivalent position'],
      },
    ],
    notes: [
      'A propulsion power limitation applies unless at least half the required experience was on vessels of 4,000 HP / 3,000 kW or more',
      'Supports STCW endorsements under 46 CFR 11.325, 11.327 and 11.331',
    ],
  },
  {
    id: 'uscg-assistant-engineer-osv',
    title: 'Assistant Engineer-OSV',
    regulation: '46 CFR 11.555',
    description: 'Assistant Engineer of offshore supply vessels',
    category: 'Offshore Supply Vessels',
    totalDays: 1080,
    requirements: [
      {
        label: 'Engine Room Service (Unlimited Propulsion Power)',
        value: '1,080 days (3 years)',
        details: [
          'Including 540 days as a QMED or an equivalent position',
          'Alternative: 360 days as part of an approved or accepted Assistant Engineer-OSV training programme',
        ],
      },
      {
        label: 'Under 4,000 HP / 3,000 kW',
        value: '720 days (2 years)',
        details: ['Including 360 days as a QMED or an equivalent position'],
      },
      {
        label: 'Under 1,000 HP / 750 kW',
        value: '360 days (1 year)',
        details: ['Including 180 days as a QMED or an equivalent position'],
      },
    ],
    notes: ['Supports STCW endorsements under 46 CFR 11.329 and 11.333'],
  },

  // ── Fishing industry vessels ─────────────────────────────────────
  {
    id: 'uscg-chief-engineer-fishing',
    title: 'Chief Engineer, Uninspected Fishing Industry Vessels',
    regulation: '46 CFR 11.530(c)',
    description: 'Documented fishing industry vessels, ocean waters',
    category: 'Fishing Industry Vessels',
    totalDays: 1440,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,440 days (4 years)',
      },
      {
        label: 'Service as Assistant Engineer',
        value: '360 days (1 year)',
        details: ['As an Assistant Engineer Officer or an equivalent position'],
      },
    ],
    notes: [
      'Two-thirds of the required service must have been on motor vessels',
      'Propulsion power limits apply under 46 CFR 11.503',
      'Does not apply to wooden ships of primitive build, unrigged vessels, or vessels under 200 GRT',
    ],
  },
  {
    id: 'uscg-assistant-engineer-fishing',
    title: 'Assistant Engineer, Uninspected Fishing Industry Vessels',
    regulation: '46 CFR 11.530(d)',
    description: 'Documented fishing industry vessels, ocean waters',
    category: 'Fishing Industry Vessels',
    totalDays: 1080,
    requirements: [
      {
        label: 'Engine Room Service',
        value: '1,080 days (3 years)',
      },
    ],
    notes: [
      'Two-thirds of the required service must have been on motor vessels',
      'Propulsion power limits apply under 46 CFR 11.503',
      'Does not apply to wooden ships of primitive build, unrigged vessels, or vessels under 200 GRT',
    ],
  },

  // ── Mobile offshore drilling units ───────────────────────────────
  {
    id: 'uscg-chief-engineer-modu',
    title: 'Chief Engineer-MODU',
    regulation: '46 CFR 11.542',
    description: 'Chief Engineer of mobile offshore drilling units',
    category: 'Mobile Offshore Drilling Units',
    totalDays: 2160,
    requirements: [
      {
        label: 'Employment Assigned to MODUs',
        value: '2,160 days (6 years)',
        details: [
          'Including 1,080 days as Mechanic, Motorman, Subsea Engineer, Electrician, Barge Engineer, Toolpusher, Unit Superintendent, Crane Operator or an equivalent',
          'At least 540 days of that employment on self-propelled or propulsion assisted units',
        ],
      },
      {
        label: 'Assistant Engineer-MODU Route',
        value: '720 days (2 years)',
        details: [
          'Assigned to MODUs as an Assistant Engineer-MODU',
          'At least 360 days on self-propelled or propulsion assisted units',
        ],
      },
    ],
    notes: [
      'Requires firefighting training under 46 CFR 11.201(h)',
      'Without the self-propelled service the endorsement is limited to non-self-propelled units, and the limit can be removed later',
      'Supports STCW endorsements under 46 CFR 11.325, 11.327 and 11.331',
    ],
  },
  {
    id: 'uscg-assistant-engineer-modu',
    title: 'Assistant Engineer-MODU',
    regulation: '46 CFR 11.544',
    description: 'Assistant Engineer of mobile offshore drilling units',
    category: 'Mobile Offshore Drilling Units',
    totalDays: 1080,
    requirements: [
      {
        label: 'Employment Assigned to MODUs',
        value: '1,080 days (3 years)',
        details: [
          'Including 540 days as Mechanic, Motorman, Subsea Engineer, Electrician, Barge Engineer, Toolpusher, Unit Superintendent, Crane Operator or an equivalent',
          'At least 270 days of that employment on self-propelled or propulsion assisted units',
        ],
      },
    ],
    notes: [
      'Alternative: 3 years in the machinist trade building or repairing diesel engines plus 360 days on MODUs as Mechanic, Motorman, Oiler or an equivalent, of which 270 days on self-propelled or propulsion assisted units',
      'Alternative: an ABET accredited marine, mechanical or electrical engineering technology degree plus 180 days on self-propelled or propulsion assisted units',
      'Requires firefighting training under 46 CFR 11.201(h)',
      'Supports STCW endorsements under 46 CFR 11.329 and 11.333',
    ],
  },

  // ── STCW engineer endorsements ───────────────────────────────────
  {
    id: 'uscg-stcw-chief-engineer-3000kw',
    title: 'STCW Chief Engineer, 3,000 kW / 4,000 HP or More (Management Level)',
    regulation: '46 CFR 11.325',
    description: 'STCW Regulation III/2',
    category: 'STCW Engineer',
    totalDays: 1080,
    requirements: [
      {
        label: 'Service as OICEW',
        value: '1,080 days (36 months)',
        details: [
          'On ships powered by main propulsion machinery of 750 kW / 1,000 HP or more',
          'Reducible to 720 days if at least 360 days were served as Second Engineer Officer on ships of 3,000 kW / 4,000 HP or more',
        ],
      },
    ],
    notes: [
      'Requires the standard of competence in Section A-III/2 of the STCW Code',
      'Requires engine room resource management if not completed at the operational level, and leadership and managerial skills',
    ],
  },
  {
    id: 'uscg-stcw-second-engineer-3000kw',
    title: 'STCW Second Engineer, 3,000 kW / 4,000 HP or More (Management Level)',
    regulation: '46 CFR 11.327',
    description: 'STCW Regulation III/2',
    category: 'STCW Engineer',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as OICEW',
        value: '360 days (12 months)',
        details: [
          'On vessels powered by main propulsion machinery of 750 kW / 1,000 HP or more',
          'Alternative: 360 days as Chief Engineer on vessels between 750 kW / 1,000 HP and 3,000 kW / 4,000 HP',
        ],
      },
    ],
    notes: ['Requires the standard of competence in Section A-III/2 of the STCW Code'],
  },
  {
    id: 'uscg-stcw-oicew',
    title: 'STCW OICEW / Designated Duty Engineer, 750 kW / 1,000 HP or More (Operational Level)',
    regulation: '46 CFR 11.329',
    description: 'Officer in Charge of an Engineering Watch, STCW Regulation III/1',
    category: 'STCW Engineer',
    totalDays: 1080,
    requirements: [
      {
        label: 'Seagoing Service',
        value: '1,080 days (36 months)',
        details: [
          'In the engine department',
          'Alternative: an approved training programme combining workshop skills training with at least 360 days of seagoing service, meeting Section A-III/1',
          'Deck department service credits up to 90 days',
        ],
      },
      {
        label: 'Engine Room Watchkeeping',
        value: '180 days (6 months)',
        details: ['Supervised by an officer holding an STCW endorsement as Chief Engineer Officer or a qualified engineer officer'],
      },
    ],
    notes: ['Requires Medical First-aid Provider, and basic and advanced firefighting under 46 CFR 11.303'],
  },
  {
    id: 'uscg-stcw-chief-engineer-750-3000kw',
    title: 'STCW Chief Engineer, 750 to Under 3,000 kW (Management Level)',
    regulation: '46 CFR 11.331',
    description: 'STCW Regulation III/3',
    category: 'STCW Engineer',
    totalDays: 720,
    requirements: [
      {
        label: 'Service on Seagoing Vessels',
        value: '720 days (24 months)',
        details: [
          'On vessels powered by main propulsion machinery of not less than 750 kW / 1,000 HP',
          'At least 360 days of it while qualified to serve as Second Engineer Officer',
          'Deck department service credits up to 60 days',
        ],
      },
    ],
    notes: [
      'The applicant must also meet the requirements for certification as OICEW',
      'Requires the standard of competence in Section A-III/3 of the STCW Code',
    ],
  },
  {
    id: 'uscg-stcw-second-engineer-750-3000kw',
    title: 'STCW Second Engineer, 750 to Under 3,000 kW (Management Level)',
    regulation: '46 CFR 11.333',
    description: 'STCW Regulation III/3',
    category: 'STCW Engineer',
    totalDays: 360,
    requirements: [
      {
        label: 'Service as Assistant Engineer or Engineer Officer',
        value: '360 days (12 months)',
        details: [
          'On vessels powered by main propulsion machinery of not less than 750 kW / 1,000 HP',
          'Deck department service credits up to 30 days',
        ],
      },
    ],
    notes: [
      'The applicant must also meet the requirements for certification as OICEW',
      'Requires the standard of competence in Section A-III/3 of the STCW Code',
    ],
  },
  {
    id: 'uscg-stcw-eto',
    title: 'STCW Electro-technical Officer (ETO)',
    regulation: '46 CFR 11.335',
    description: 'STCW Regulation III/6, vessels of 750 kW / 1,000 HP or more',
    category: 'STCW Engineer',
    totalDays: 1080,
    requirements: [
      {
        label: 'Combined Workshop Training and Seagoing Service',
        value: '1,080 days (36 months)',
        details: [
          'Of which at least 900 days must be seagoing service in the engine department',
          'Deck department service credits up to 90 days',
          'Alternative: an approved training programme combining workshop skills training with at least 360 days of seagoing service, meeting Section A-III/6',
        ],
      },
    ],
    notes: [
      'Requires the standard of competence in Section A-III/6 of the STCW Code',
      'Requires Medical First-aid Provider, and basic and advanced firefighting under 46 CFR 11.303',
    ],
  },
];

// ── AMSA pathways ───────────────────────────────────────────────────
// Based on Marine Order 505 (Certificates of Competency - National Law) 2022
// 1 day = 8 hours of qualifying work on board

const AMSA_DECK_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'amsa-master-24m-nc',
    title: 'Master <24m Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <24m within EEZ',
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '120 days',
        details: [
          'On commercial vessels ≥7.5m',
          'In a deck or deck/engineering role',
          '1 day = 8 hours of qualifying work',
        ],
      },
      {
        label: 'Sea Service (without task book)',
        value: '360 days',
        details: [
          'At least half on commercial vessels',
          'On vessels ≥7.5m',
        ],
      },
    ],
    notes: [
      'Requires Certificate III in Maritime Operations',
      'LROCP (marine radio), first aid, medical fitness certificate',
      'Max 15% of deck service can be while vessel is not underway',
    ],
  },
  {
    id: 'amsa-master-35m-nc',
    title: 'Master <35m Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <35m within EEZ',
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days',
        details: [
          'On commercial vessels',
          'In a deck role',
          'On vessels ≥12m',
        ],
      },
    ],
  },
  {
    id: 'amsa-master-80m-nc',
    title: 'Master <80m Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <80m within EEZ',
    requirements: [
      {
        label: 'Sea Service',
        value: '720 days',
        details: [
          'On commercial vessels',
          'At least 360 days as mate or master',
        ],
      },
    ],
  },
];

const AMSA_ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'amsa-me-nc',
    title: 'Marine Engineer Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <500 kW',
    requirements: [
      {
        label: 'Sea Service',
        value: '120 days',
        details: [
          'In an engineering role on commercial vessels',
          '1 day = 8 hours of qualifying work',
          'Max 33% while vessel is not underway',
        ],
      },
    ],
    notes: [
      'Requires Certificate III in Marine Engineering',
      'Medical fitness certificate required',
    ],
  },
  {
    id: 'amsa-engineer-class3-nc',
    title: 'Engineer Class 3 Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <3000 kW',
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days',
        details: [
          'In an engineering role on commercial vessels',
          'On vessels ≥75 kW propulsion power',
        ],
      },
    ],
  },
];

// ── Maritime NZ pathways ────────────────────────────────────────────
// Based on Maritime Rule Part 32 and Seafarer Certification Framework (Jan 2024)

const MNZ_DECK_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'mnz-skipper-restricted-limits',
    title: 'Skipper Restricted Limits (SRL)',
    regulation: 'Part 32',
    description: 'Vessels <24m in restricted limits',
    requirements: [
      {
        label: 'Sea Service',
        value: '200 days',
        details: [
          'On vessels relevant to the certificate',
          'Within the preceding 5 years',
        ],
      },
    ],
    notes: [
      'Entry-level NZ skipper qualification',
      'Requires approved training and examination',
    ],
  },
  {
    id: 'mnz-skipper-coastal-nearshore',
    title: 'Skipper Coastal/Near Shore',
    regulation: 'Part 32',
    description: 'Vessels <24m coastal',
    requirements: [
      {
        label: 'Sea Service',
        value: '400 days',
        details: [
          'On seagoing vessels ≥6m',
          'At least 200 days as SRL holder',
        ],
      },
    ],
  },
  {
    id: 'mnz-mate-500gt',
    title: 'Mate <500 GT',
    regulation: 'Part 32',
    description: 'Near coastal waters',
    requirements: [
      {
        label: 'Sea Service',
        value: '540 days',
        details: [
          'On seagoing vessels',
          'As a watchkeeping officer or in a deck capacity',
        ],
      },
    ],
  },
  {
    id: 'mnz-master-500gt',
    title: 'Master <500 GT',
    regulation: 'Part 32',
    description: 'Near coastal waters',
    requirements: [
      {
        label: 'Sea Service',
        value: '1,080 days',
        details: [
          'On seagoing vessels',
          'At least 360 days as mate or master',
        ],
      },
    ],
  },
];

const MNZ_ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'mnz-marine-engineer-class6',
    title: 'Marine Engineer Class 6',
    regulation: 'Part 32',
    description: 'Vessels <750 kW',
    requirements: [
      {
        label: 'Sea Service',
        value: '180 days',
        details: [
          'In the engine department',
          'On vessels of appropriate power',
        ],
      },
    ],
  },
  {
    id: 'mnz-marine-engineer-class5',
    title: 'Marine Engineer Class 5',
    regulation: 'Part 32',
    description: 'Vessels <3000 kW',
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days',
        details: [
          'In the engine department',
          'On vessels ≥350 kW',
          'At least 180 days as engineer watchkeeper',
        ],
      },
    ],
  },
];

// ── Combined exports ────────────────────────────────────────────────

export type MaritimeAuthority = 'mca' | 'uscg' | 'amsa' | 'mnz';

// MCA (all pathways)
export const MCA_DECK = MCA_REQUIREMENTS;
export const MCA_ENGINEERING = ENGINEERING_REQUIREMENTS;

// USCG
export const USCG_DECK = USCG_DECK_REQUIREMENTS;
export const USCG_ENGINEERING = USCG_ENGINEERING_REQUIREMENTS;

// AMSA
export const AMSA_DECK = AMSA_DECK_REQUIREMENTS;
export const AMSA_ENGINEERING = AMSA_ENGINEERING_REQUIREMENTS;

// Maritime NZ
export const MNZ_DECK = MNZ_DECK_REQUIREMENTS;
export const MNZ_ENGINEERING = MNZ_ENGINEERING_REQUIREMENTS;

// Legacy exports (backwards compatibility)
export const DECK_REQUIREMENTS = MCA_REQUIREMENTS;
export const ENGINEERING_REQUIREMENTS_LIST = ENGINEERING_REQUIREMENTS;
export const ALL_REQUIREMENTS = [
  ...MCA_REQUIREMENTS,
  ...ENGINEERING_REQUIREMENTS,
  ...USCG_DECK_REQUIREMENTS,
  ...USCG_ENGINEERING_REQUIREMENTS,
  ...AMSA_DECK_REQUIREMENTS,
  ...AMSA_ENGINEERING_REQUIREMENTS,
  ...MNZ_DECK_REQUIREMENTS,
  ...MNZ_ENGINEERING_REQUIREMENTS,
];

export const getRequirementById = (id: string): MCARequirement | undefined => {
  return ALL_REQUIREMENTS.find((req) => req.id === id);
};

export const getRequirementsByAuthority = (
  authority: MaritimeAuthority,
  department: 'deck' | 'engineering',
): MCARequirement[] => {
  switch (authority) {
    case 'mca':
      return department === 'deck' ? MCA_DECK : MCA_ENGINEERING;
    case 'uscg':
      return department === 'deck' ? USCG_DECK : USCG_ENGINEERING;
    case 'amsa':
      return department === 'deck' ? AMSA_DECK : AMSA_ENGINEERING;
    case 'mnz':
      return department === 'deck' ? MNZ_DECK : MNZ_ENGINEERING;
    default:
      return department === 'deck' ? MCA_DECK : MCA_ENGINEERING;
  }
};

export const getRequirementsByDepartment = (department: 'deck' | 'engineering'): MCARequirement[] => {
  return department === 'deck' ? DECK_REQUIREMENTS : ENGINEERING_REQUIREMENTS_LIST;
};

export const getRequirementTitles = (): { id: string; title: string }[] => {
  return ALL_REQUIREMENTS.map((req) => ({ id: req.id, title: req.title }));
};

/** Human-readable labels for each maritime authority. */
export const AUTHORITY_LABELS: Record<MaritimeAuthority, string> = {
  mca: 'MCA',
  uscg: 'USCG',
  amsa: 'AMSA',
  mnz: 'Maritime NZ',
};

/** Full titles, used for screen headings and report headers. */
export const AUTHORITY_FULL_NAMES: Record<MaritimeAuthority, string> = {
  mca: 'Maritime and Coastguard Agency',
  uscg: 'United States Coast Guard',
  amsa: 'Australian Maritime Safety Authority',
  mnz: 'Maritime New Zealand',
};

export interface RequirementGroup {
  category: string;
  items: MCARequirement[];
}

/**
 * Group a requirement list by its `category` field, preserving first-seen order.
 * Entries with no category fall into a single untitled group, which keeps the
 * MCA, AMSA and MNZ lists rendering exactly as they did before.
 */
export const groupRequirementsByCategory = (
  requirements: MCARequirement[],
): RequirementGroup[] => {
  const groups: RequirementGroup[] = [];
  const byCategory = new Map<string, RequirementGroup>();

  for (const requirement of requirements) {
    const category = requirement.category ?? '';
    let group = byCategory.get(category);
    if (!group) {
      group = { category, items: [] };
      byCategory.set(category, group);
      groups.push(group);
    }
    group.items.push(requirement);
  }

  return groups;
};

/** Look up a requirement by id, restricted to one authority and department. */
export const getRequirementByIdForPathway = (
  id: string,
  authority: MaritimeAuthority,
  department: 'deck' | 'engineering',
): MCARequirement | undefined =>
  getRequirementsByAuthority(authority, department).find((req) => req.id === id);

/**
 * Default target credential for a pathway, used when the user has not picked
 * one yet. These are the endorsements most users of each pathway are working
 * toward, not a recommendation.
 */
export const DEFAULT_TARGET_BY_PATHWAY: Record<string, string> = {
  'mca:deck': 'oow-yachts-3000gt',
  'mca:engineering': 'eoow-sv',
  'uscg:deck': 'uscg-master-nc-200grt',
  'uscg:engineering': 'uscg-dde-1000hp',
  'amsa:deck': 'amsa-master-24m-nc',
  'amsa:engineering': 'amsa-me-nc',
  'mnz:deck': 'mnz-skipper-restricted-limits',
  'mnz:engineering': 'mnz-marine-engineer-class6',
};

export const getDefaultTargetId = (
  authority: MaritimeAuthority,
  department: 'deck' | 'engineering',
): string | undefined => {
  const preferred = DEFAULT_TARGET_BY_PATHWAY[`${authority}:${department}`];
  const list = getRequirementsByAuthority(authority, department);
  if (preferred && list.some((req) => req.id === preferred)) return preferred;
  return list[0]?.id;
};

export interface ServiceDefinition {
  title: string;
  description: string;
  department: 'deck' | 'engineering' | 'both';
}

/**
 * How the Coast Guard counts service, for the definitions panel. The MCA yacht
 * definitions the app ships (MSN 1858 / MSN 1904) do not apply to a USCG
 * applicant, so a USCG user is shown these instead.
 */
export const USCG_SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    title: 'A Day of Service',
    description:
      '8 hours of watchstanding or day-working, not counting overtime. On a vessel authorised to run a two-watch system under 46 U.S.C. 8104, a 12-hour working day may be credited as 1.5 days, which an evaluator applies to your application (46 CFR 10.107).',
    department: 'both',
  },
  {
    title: 'Months and Years',
    description:
      'A month is 30 days and a year is 360 days. Every day figure in the requirements list is converted on that basis (46 CFR 10.107).',
    department: 'both',
  },
  {
    title: 'Service',
    description:
      'The time, in days, you are assigned to work aboard. Yard periods and time in port are not sea service, and on a MODU time ashore during crew rotation is excluded.',
    department: 'both',
  },
  {
    title: 'Route Credit',
    description:
      'Toward an ocean, near-coastal or STCW endorsement, Great Lakes service credits day for day up to the full requirement, and other inland navigable waters credit day for day for up to 50 percent of it (46 CFR 11.211).',
    department: 'both',
  },
  {
    title: 'Tonnage',
    description:
      'A vessel measured only under the Convention (ITC) scheme is credited as Gross Register Tonnage (46 CFR 11.211(h)). Endorsements under 200 GRT are issued at 25, 50, 100 or 200 GRT based on the tonnage your service was gained on (46 CFR 11.422).',
    department: 'deck',
  },
  {
    title: 'Propulsion Power',
    description:
      'Engineer endorsements carry a propulsion power limitation unless at least half the qualifying service was on vessels of 4,000 HP / 3,000 kW or more (46 CFR 11.503).',
    department: 'engineering',
  },
  {
    title: 'Towing and ATB Service',
    description:
      'Service as Master or Mate (Pilot) of Towing Vessels, and service on articulated or dual mode integrated tug barges of 1,600 GRT / 3,000 GT or more, credits two days for one toward unlimited endorsements, for up to 50 percent of the required large-vessel service (46 CFR 11.211).',
    department: 'deck',
  },
  {
    title: 'Documenting Your Service',
    description:
      'Sea service is submitted on a sea service letter or Form CG-719S, showing the vessel name and official number, the dates served, the capacity, the tonnage or propulsion power, and the route.',
    department: 'both',
  },
];
