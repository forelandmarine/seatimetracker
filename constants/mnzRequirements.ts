import type { MCARequirement, ServiceDefinition } from './mcaRequirements';

/**
 * Maritime New Zealand (SeaCert) pathways.
 *
 * Taken from Maritime Rules Part 32 and the Seafarer Certification and
 * Operational Limits Framework (January 2024), which is the document an
 * assessor works from. The entries the app used to list were not certificates
 * SeaCert issues: there is no "Mate <500 GT" or "Skipper Coastal/Near Shore",
 * and the SRL requirement is 200 hours rather than 200 days.
 *
 * Two things about MNZ shape the data. Sea service is stated in months, and a
 * month is 30 days, so day figures here are the month figure multiplied out.
 * And the yacht certificates are written in the same actual / stand-by / yard
 * language as the MCA yacht pathway, which is the split the app already tracks.
 */

// ── Deck: restricted limits ─────────────────────────────────────────

const MNZ_DECK_RESTRICTED: MCARequirement[] = [
  {
    id: 'mnz-qdc',
    title: 'Qualified Deck Crew (QDC)',
    regulation: 'Part 32',
    description: 'Deck crew on ships <24m, restricted and near coastal',
    category: 'Restricted Limits',
    requirements: [
      {
        label: 'Sea Service',
        value: 'No minimum',
        details: [
          'No sea service requirement, but an approved training record book must be completed on board a commercial ship or a warship',
        ],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Domestic Maritime Crewing (Level 3)',
      'Current first aid certificate and RROC, minimum age 16',
      'Can carry a passenger endorsement',
      'Progresses to Skipper Restricted Limits',
    ],
  },
  {
    id: 'mnz-srl',
    title: 'Skipper Restricted Limits (SRL)',
    regulation: 'Part 32',
    description: 'Master of ships <12m within restricted limits',
    category: 'Restricted Limits',
    totalHours: 200,
    requirements: [
      {
        label: 'Sea Service',
        value: '200 hours',
        details: [
          'On a powered vessel of any kind, which may include pleasure craft or sailing vessels (required)',
          'Time on a pleasure craft only counts where you were acting as skipper',
          'Plus completion of an approved training record book on board',
        ],
      },
      {
        label: 'Privileges',
        value: '<12m',
        details: [
          'Master of passenger and non-passenger ships under 12 metres carrying 19 passengers or fewer within restricted limits',
          'Master of fishing vessels under 12 metres within enclosed water, inshore and inshore fishing limits',
        ],
      },
    ],
    notes: [
      'This requirement is counted in hours, not days, so the app shows your logged hours against it',
      'Requires the NZ Certificate in Domestic Maritime Operations (Restricted Limits) (Level 4)',
      'Current first aid certificate and RROC, minimum age 18',
      'Can be endorsed up to 24 metres, to less than 500 GT, or 500 to 3000 GT',
    ],
  },
  {
    id: 'mnz-srl-24m',
    title: 'SRL Endorsed to 24 Metres',
    regulation: 'Part 32',
    description: 'SRL endorsement for ships <24m',
    category: 'Restricted Limits',
    totalDays: 180,
    requirements: [
      {
        label: 'Sea Service (holding SRL)',
        value: '180 days (6 months)',
        details: ['On a commercial vessel of any length, in a deck capacity'],
      },
      {
        label: 'Sea Service (not holding SRL)',
        value: '180 days (6 months)',
        details: ['On a commercial vessel of 12 metres or more, in a deck capacity'],
      },
    ],
    notes: [
      'Master of ships under 24 metres carrying up to 19 passengers within restricted limits, and of fishing vessels under 24 metres within enclosed, inshore and inshore fishing limits',
      'Also mate on commercial ships under 500 GT within restricted limits, and under 24 metres within coastal limits',
    ],
  },
  {
    id: 'mnz-srl-500gt',
    title: 'SRL Endorsed to <500 GT',
    regulation: 'Part 32',
    description: 'SRL endorsement for ships <500 GT',
    category: 'Restricted Limits',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days (12 months)',
        details: [
          'On vessels of 12 metres or more while holding an SRL certificate endorsed to 24 metres or equivalent',
          'Completed within the 5 years before the application',
          'Plus an approved training record book',
        ],
      },
    ],
    notes: [
      'Master of ships under 500 GT carrying 19 passengers or fewer within restricted limits, and of fishing vessels under 500 GT within enclosed, inshore and inshore fishing limits',
      'Requires an oral examination with an approved Maritime NZ examiner',
    ],
  },
  {
    id: 'mnz-srl-3000gt',
    title: 'SRL Endorsed 500 to 3000 GT',
    regulation: 'Part 32',
    description: 'SRL endorsement for ships 500 to 3000 GT',
    category: 'Restricted Limits',
    requirements: [
      {
        label: 'Sea Service',
        value: 'No further minimum',
        details: [
          'Holds an SRL certificate endorsed to 500 GT or equivalent',
          'Plus an approved training course or structured training programme',
        ],
      },
    ],
    notes: [
      'Master of vessels of 500 to 3000 GT operating exclusively in restricted limits',
      'Requires an oral examination with an approved Maritime NZ examiner',
      'Vessels of 3000 GT or more in restricted limits must be crewed by holders of STCW unlimited certificates',
    ],
  },
];

// ── Deck: coastal and offshore ──────────────────────────────────────

const MNZ_DECK_COASTAL: MCARequirement[] = [
  {
    id: 'mnz-sco',
    title: 'Skipper Coastal/Offshore (SCO)',
    regulation: 'Part 32',
    description: 'Master of ships <24m within coastal and offshore limits',
    category: 'Coastal & Offshore',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days (12 months)',
        details: ['On vessels of 12 metres or more within any operational limit (required)'],
      },
      {
        label: 'Prior Certificate',
        value: 'SRL endorsed to 24m',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Master within restricted, coastal and offshore limits on ships under 24 metres, carrying 19 passengers or fewer within restricted limits and 12 or fewer within coastal and offshore limits',
      'Requires the NZ Certificate in Domestic Maritime Operations (Coastal & Offshore) (Level 4)',
      'First aid, fire fighting, survival craft and GROC, or STCW basic training plus GROC',
      'Progresses to Watchkeeper Deck <500 GT NC, Watchkeeper Deck, or Mate Fishing Vessel Limited',
    ],
  },
  {
    id: 'mnz-master-yacht-24m',
    title: 'Master Yacht <24 Metres',
    regulation: 'Part 32',
    description: 'Master of sailing ships <24m, restricted to offshore limits',
    category: 'Coastal & Offshore',
    totalDays: 50,
    requirements: [
      {
        label: 'Sea Service',
        value: '50 days',
        details: [
          'On a sailing ship (required)',
          'Including a total distance of 2,500 nautical miles',
          'Including at least 5 passages over 60 nautical miles, of which two overnight and two as skipper',
          'Pleasure craft time counts only where you were acting as skipper',
        ],
      },
    ],
    notes: [
      'Requires an RYA Yachtmaster Offshore course or equivalent',
      'First aid, fire fighting, survival craft and GROC, or STCW basic training plus GROC',
      'Minimum age 18',
      'Progresses to Chief Mate Yacht',
    ],
  },
  {
    id: 'mnz-wkd-500gt-nc',
    title: 'Watchkeeper Deck <500 GT Near-Coastal',
    regulation: 'STCW II/3.3',
    description: 'Officer of the watch on ships <500 GT, coastal and offshore',
    category: 'Coastal & Offshore',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'On vessels of 12 metres or more (required)',
          'Including at least 540 days (18 months) operating beyond restricted limits in a deck capacity on non-fishing vessels',
        ],
      },
      {
        label: 'Sea Service (option 2)',
        value: '360 days (12 months)',
        details: [
          'On vessels of 12 metres or more (required)',
          'Including at least 180 days (6 months) beyond restricted limits in a deck capacity on non-fishing vessels',
        ],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Maritime Operations (Level 4) watchkeeping strand',
      'STCW basic training, survival craft and rescue boats, advanced fire fighting, medical first aid, GROC, and generic ECDIS where fitted',
      'Minimum age 18',
      'Progresses to Master <500 GT Near-Coastal or Skipper Fishing Vessel Limited',
    ],
  },
  {
    id: 'mnz-master-500gt-nc',
    title: 'Master <500 GT Near-Coastal',
    regulation: 'STCW II/3.5',
    description: 'Master of ships <500 GT, coastal and offshore limits',
    category: 'Coastal & Offshore',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '360 days (12 months)',
        details: [
          'On ships of 24 metres or more in length, or 80 GT or more, operating beyond restricted limits (preferred)',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Watchkeeper Deck <500 GT NC',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Maritime Operations (Level 5)',
      'STCW basic training, advanced fire fighting, survival craft and rescue boats, medical first aid, GROC, and generic ECDIS where fitted',
      'Progresses to Watchkeeper Deck or Master <500 GT',
    ],
  },
];

// ── Deck: fishing vessels ───────────────────────────────────────────

const MNZ_DECK_FISHING: MCARequirement[] = [
  {
    id: 'mnz-adh-fishing',
    title: 'Advanced Deckhand Fishing (ADH-F)',
    regulation: 'STCW-F Res. 4',
    description: 'Deckhand on fishing vessels of any length, any area',
    category: 'Fishing',
    totalDays: 180,
    requirements: [
      {
        label: 'Sea Service',
        value: '180 days (6 months)',
        details: [
          'On fishing vessels operating beyond enclosed water limits',
          'Including completion of an approved training record book',
        ],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Fishing Vessel Crewing (Level 3)',
      'STCW-F basic safety training, minimum age 16',
      'Progresses to Mate Fishing Vessel Limited or Unlimited',
    ],
  },
  {
    id: 'mnz-mfv-limited',
    title: 'Mate Fishing Vessel Limited (MFV)',
    regulation: 'STCW-F II/4',
    description: 'Mate on fishing vessels <45m in limited waters',
    category: 'Fishing',
    totalDays: 720,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '720 days (24 months)',
        details: [
          'In a deck capacity on fishing vessels of 12 metres or more (required)',
          'Including at least 360 days (12 months) outside restricted limits',
        ],
      },
      {
        label: 'Sea Service (option 2, holding ADH-F)',
        value: '540 days (18 months)',
        details: [
          'In a deck capacity on fishing vessels of 12 metres or more (required)',
          'Including at least 360 days (12 months) outside restricted limits while holding ADH-F',
        ],
      },
      {
        label: 'Sea Service (option 3, holding SCO)',
        value: '360 days (12 months)',
        details: [
          'In a deck capacity on fishing vessels of 12 metres or more while holding SCO (required)',
          'Including at least 180 days (6 months) outside restricted limits',
        ],
      },
    ],
    notes: [
      'Mate on fishing vessels under 45 metres in inshore fishing limits and limited waters, and watchkeeper on fishing vessels of any length in unlimited waters',
      'Requires the NZ Certificate in Marine Operations (Level 4) with fishing strand',
      'STCW-F basic safety training and GROC, minimum age 18',
    ],
  },
  {
    id: 'mnz-sfv-limited',
    title: 'Skipper Fishing Vessel Limited (SFV)',
    regulation: 'STCW-F II/3',
    description: 'Master of fishing vessels <45m in limited waters',
    category: 'Fishing',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '360 days (12 months)',
        details: ['On fishing vessels of 12 metres or more beyond restricted limits (required)'],
      },
      {
        label: 'Prior Certificate',
        value: 'MFV',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Master of fishing vessels under 45 metres in inshore fishing limits and limited waters, and of passenger and non-passenger ships under 24 metres in the same waters',
      'Requires the NZ Certificate in Maritime Operations (Level 5)',
      'STCW-F basic safety training and GROC',
    ],
  },
  {
    id: 'mnz-mfv-unlimited',
    title: 'Mate Fishing Vessel Unlimited (MFV-U)',
    regulation: 'STCW-F II/2',
    description: 'Mate on fishing vessels of any size, any area',
    category: 'Fishing',
    totalDays: 720,
    requirements: [
      {
        label: 'Sea Service',
        value: '720 days (24 months)',
        details: [
          'On fishing vessels of 12 metres or more operating outside restricted limits (required)',
          'While in a deck capacity',
        ],
      },
    ],
    notes: [
      'Requires the NZ Diploma in Fishing Vessel Operations (Level 6)',
      'STCW-F basic safety training, survival craft and rescue boats, advanced fire fighting and GMDSS',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-sfv-unlimited',
    title: 'Skipper Fishing Vessel Unlimited (SFV-U)',
    regulation: 'STCW-F II/1',
    description: 'Master of fishing vessels of any size, any area',
    category: 'Fishing',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days (12 months)',
        details: [
          'On fishing vessels of 12 metres or more outside restricted limits while holding MFV-U',
          'As skipper or officer in charge of a navigational watch',
          'Up to 180 days (6 months) may be substituted from service as officer in charge of a navigational watch on vessels covered by STCW',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'MFV-U',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'The most senior certificate for command of fishing vessels',
      'Requires the NZ Diploma in Fishing Vessel Operations (Level 6) with the fishing vessel skipper strand',
    ],
  },
];

// ── Deck: unlimited area ────────────────────────────────────────────

const MNZ_DECK_UNLIMITED: MCARequirement[] = [
  {
    id: 'mnz-dwr',
    title: 'Deck Watch Rating (DWR)',
    regulation: 'STCW II/4',
    description: 'Deck crew forming part of a navigational watch, any tonnage',
    category: 'Unlimited Area',
    totalDays: 180,
    totalDaysWithRecordBook: 60,
    requirements: [
      {
        label: 'Sea Service (with training)',
        value: '60 days (2 months)',
        details: [
          'On vessels of 500 GT or more (preferred)',
          'Associated with navigational watchkeeping, carried out under the supervision of the master or a qualified rating',
        ],
      },
      {
        label: 'Sea Service (without training)',
        value: '180 days (6 months)',
        details: ['Same vessel and supervision conditions'],
      },
    ],
    notes: [
      'The training route requires the NZ Certificate in Maritime Crewing (Level 3) with deck crewing strand',
      'STCW basic training, security awareness where the ship is subject to the ISPS code, and a steering certificate',
      'Minimum age 16',
    ],
  },
  {
    id: 'mnz-ab-deck',
    title: 'Able Seafarer Deck (AB Deck)',
    regulation: 'STCW II/5',
    description: 'Deck rating forming part of a navigational watch, any tonnage',
    category: 'Unlimited Area',
    totalDays: 540,
    totalDaysWithRecordBook: 360,
    requirements: [
      {
        label: 'Sea Service (with training)',
        value: '360 days (12 months)',
        details: [
          'In the deck department on vessels of 500 GT or more operating beyond restricted limits (preferred)',
          'While holding a Deck Watch Rating certificate',
          'Plus an approved Able Seafarer Deck course',
        ],
      },
      {
        label: 'Sea Service (without training)',
        value: '540 days (18 months)',
        details: ['Same vessel and certificate conditions'],
      },
    ],
    notes: [
      'Prior certificate: Deck Watch Rating or equivalent',
      'The training route requires the NZ Certificate in Maritime Crewing (Level 4) deck crew strand',
      'STCW basic training, survival craft and rescue boats, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-integrated-rating',
    title: 'Integrated Rating (IR)',
    regulation: 'STCW II/5 and III/5',
    description: 'Deck and engine room support level, any tonnage',
    category: 'Unlimited Area',
    requirements: [
      {
        label: 'Sea Service',
        value: 'No further minimum',
        details: [
          'Meet the requirements of both AB Deck and AB Engine, or equivalent',
          'No separate sea service and no final examination for this certificate',
        ],
      },
    ],
    notes: [
      'STCW basic training, survival craft and rescue boats, and security awareness where the ISPS code applies',
      'Progresses to Watchkeeper Deck <500 GT NC, Watchkeeper Deck, or MEC 3',
    ],
  },
  {
    id: 'mnz-wkd',
    title: 'Watchkeeper Deck',
    regulation: 'STCW II/1',
    description: 'Officer of the watch, any tonnage, any area',
    category: 'Unlimited Area',
    totalDays: 1080,
    totalDaysWithRecordBook: 360,
    requirements: [
      {
        label: 'Sea Service (cadet programme)',
        value: '360 days (12 months)',
        details: [
          'On vessels of 500 GT or more operating beyond restricted limits (preferred)',
          'Including at least 180 days (6 months) of supervised bridge watchkeeping',
          'Including evidence of a cadet programme',
        ],
      },
      {
        label: 'Sea Service (other route)',
        value: '1,080 days (36 months)',
        details: [
          'On vessels of 500 GT or more operating beyond restricted limits (preferred)',
          'Including at least 180 days (6 months) of supervised bridge watchkeeping',
        ],
      },
    ],
    notes: [
      'Requires the NZ Diploma in Nautical Science (Level 6)',
      'STCW basic training, advanced fire fighting, survival craft and rescue boats, medical first aid, GMDSS, generic ECDIS where fitted, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-chief-mate-3000gt',
    title: 'Chief Mate <3000 GT',
    regulation: 'STCW II/2.3',
    description: 'Chief mate on ships <3000 GT, any area',
    category: 'Unlimited Area',
    requirements: [
      {
        label: 'Sea Service',
        value: 'No further minimum',
        details: ['No sea service requirement beyond holding Watchkeeper Deck or a higher certificate'],
      },
    ],
    notes: [
      'Also officer in charge of a navigational watch on any tonnage in any area',
      'Requires the Diploma in Masters and Chiefs Foreign Going programme, Chief Mate Foreign Going strand',
      'STCW basic training, advanced fire fighting, survival craft and rescue boats, medical care on board, GMDSS, generic ECDIS where fitted, and security awareness where the ISPS code applies',
    ],
  },
  {
    id: 'mnz-master-500gt',
    title: 'Master <500 GT',
    regulation: 'STCW II/2',
    description: 'Master on ships <500 GT, any area',
    category: 'Unlimited Area',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'As officer in charge of a navigational watch on ships of 24 metres or more, or 80 GT or more (required)',
          'Including at least 720 days (24 months) on voyages over 24 hours while holding Watchkeeper Deck <500 GT NC or higher',
          'Including 360 days (12 months) while holding Master <500 GT NC',
        ],
      },
      {
        label: 'Sea Service (option 2)',
        value: '720 days (24 months)',
        details: [
          'As officer in charge of a navigational watch on ships of 24 metres or more, or 80 GT or more, while holding Master <500 GT NC (required)',
          'Including at least 360 days (12 months) as chief mate or master',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Master <500 GT NC',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Also chief mate on ships under 3000 GT within restricted, coastal and offshore limits where 6 months of the service was on a commercial ship of 500 GT or more that is not a fishing vessel',
      'Requires the NZ Diploma in Nautical Science (Level 6), with the applicable sections of the NZ Diploma in Yacht Operations (Level 6) Master Yacht strand',
    ],
  },
  {
    id: 'mnz-chief-mate',
    title: 'Chief Mate',
    regulation: 'STCW II/2',
    description: 'Chief mate on ships of any size, any area',
    category: 'Unlimited Area',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '360 days (12 months)',
        details: [
          'On vessels of 500 GT or more operating beyond restricted limits (preferred)',
          'As officer in charge of a navigational watch',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Watchkeeper Deck',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Requires the Masters and Chiefs Foreign Going programme, Chief Mate Foreign Going strand',
      'STCW basic training, advanced fire fighting, medical care on board, survival craft and rescue boats, GMDSS, generic ECDIS where fitted, and security awareness where the ISPS code applies',
    ],
  },
  {
    id: 'mnz-master-3000gt',
    title: 'Master <3000 GT',
    regulation: 'STCW II/2.3',
    description: 'Master on ships <3000 GT, any area',
    category: 'Unlimited Area',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'On ships of 500 GT or more (preferred)',
          'As officer in charge of a navigational watch while holding a Watchkeeper Deck certificate or equivalent',
        ],
      },
      {
        label: 'Sea Service (option 2)',
        value: '720 days (24 months)',
        details: [
          'On ships of 500 GT or more (preferred)',
          'Including at least 360 days (12 months) as chief mate while holding Chief Mate <3000 GT or higher',
          'Remaining time as officer in charge of a navigational watch while holding Watchkeeper Deck or higher',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Watchkeeper Deck or Chief Mate <3000 GT',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Requires the Masters and Chiefs Foreign Going programme, Foreign Going strand',
      'STCW basic training, advanced fire fighting, medical care on board, survival craft and rescue boats, GMDSS, generic ECDIS where fitted, and security awareness where the ISPS code applies',
    ],
  },
  {
    id: 'mnz-master',
    title: 'Master (Unlimited)',
    regulation: 'STCW II/2',
    description: 'Master on ships of any tonnage, any area',
    category: 'Unlimited Area',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'On ships of 500 GT or more (required)',
          'As officer in charge of a navigational watch while holding a Watchkeeper Deck certificate or higher',
        ],
      },
      {
        label: 'Sea Service (option 2)',
        value: '720 days (24 months)',
        details: [
          'On ships of 500 GT or more (required)',
          'Including at least 360 days (12 months) as chief mate while holding a Chief Mate certificate',
          'Remaining 360 days as officer in charge of a navigational watch while holding Watchkeeper Deck or higher',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Watchkeeper Deck or Chief Mate',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'The most senior command certificate',
      'Requires the Masters and Chiefs Foreign Going programme, Master Foreign Going strand',
    ],
  },
  {
    id: 'mnz-gmdss',
    title: 'GMDSS Radio Operator',
    regulation: 'STCW IV/2',
    description: 'Radio operator on a GMDSS ship',
    category: 'Unlimited Area',
    requirements: [
      {
        label: 'Sea Service',
        value: 'Not required',
        details: [
          'Requires a General Operator’s Certificate (GOC) and training leading to a GMDSS certificate',
        ],
      },
    ],
    notes: [
      'Security awareness where the ship is subject to the ISPS code',
      'Minimum age 18',
    ],
  },
];

// ── Deck: yachts and superyachts ────────────────────────────────────

const MNZ_DECK_YACHT: MCARequirement[] = [
  {
    id: 'mnz-chief-mate-yacht',
    title: 'Chief Mate Yacht',
    regulation: 'STCW II/2',
    description: 'Chief mate on superyachts <3000 GT, any area',
    category: 'Yachts & Superyachts',
    totalDays: 1080,
    totalDaysWithRecordBook: 730,
    watchkeepingDays: 180,
    watchkeepingDaysWithRecordBook: 180,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'In a deck capacity while holding an SRL certificate or equivalent',
          'Including at least 180 days (6 months) of navigational watchkeeping under the supervision of a master or deck officer',
          'Including at least 360 days (12 months) on ships of 12 metres or more beyond restricted limits (required)',
          'Documented in an approved training record book',
        ],
      },
      {
        label: 'Sea Service (option 2, approved training)',
        value: '500 days actual sea service',
        details: [
          'Where approved training is accepted in reduction of sea service',
          'Including at least 180 days (6 months) of navigational watchkeeping under supervision',
          'Plus 230 days of any combination of actual sea service, stand-by service or yard service',
        ],
      },
    ],
    notes: [
      'Option 2 is written in the same actual, stand-by and yard split the app already records, so those three totals map straight onto it',
      'Requires the NZ Diploma in Yacht Operations (Level 6)',
      'STCW basic training, survival craft and rescue boats, advanced fire fighting, medical care on board, GMDSS, generic ECDIS where fitted, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-master-yacht-500gt',
    title: 'Master Yacht <500 GT',
    regulation: 'STCW II/2',
    description: 'Master on superyachts <500 GT, any area',
    category: 'Yachts & Superyachts',
    totalDays: 360,
    watchkeepingDays: 120,
    requirements: [
      {
        label: 'Onboard Yacht Service',
        value: '360 days (12 months)',
        details: [
          'While holding a Chief Mate Yacht certificate',
          'In a deck officer capacity',
        ],
      },
      {
        label: 'Watchkeeping Service',
        value: '120 days',
        details: ['May be counted inside the 12 months'],
      },
      {
        label: 'Prior Certificate',
        value: 'Chief Mate Yacht',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Requires the NZ Diploma in Yacht Operations (Level 6) with the Master Yacht strand',
      'STCW basic training, survival craft and rescue boats, advanced fire fighting, medical care on board, GMDSS, generic ECDIS where fitted, and security awareness where the ISPS code applies',
    ],
  },
  {
    id: 'mnz-master-yacht',
    title: 'Master Yacht',
    regulation: 'STCW II/2',
    description: 'Master on superyachts <3000 GT, any area',
    category: 'Yachts & Superyachts',
    totalDays: 720,
    watchkeepingDays: 240,
    watchkeepingDaysWithRecordBook: 120,
    requirements: [
      {
        label: 'Onboard Yacht Service (option 1)',
        value: '720 days (24 months)',
        details: [
          'In a deck officer capacity while holding Chief Mate Yacht or equivalent',
          'Including either 360 days (12 months) on ships over 24 metres or over 80 GT, or 180 days (6 months) on ships over 500 GT',
          'Including 240 days of watchkeeping service, which may be part of the 24 months',
        ],
      },
      {
        label: 'Onboard Yacht Service (option 2)',
        value: '360 days (12 months)',
        details: [
          'In a deck officer capacity while holding Master Yacht <500 GT or equivalent',
          'Including either 180 days (6 months) on ships over 24 metres or over 80 GT, or 90 days (3 months) on ships over 500 GT (required)',
          'Including 120 days of watchkeeping, which may be part of the 12 months',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Chief Mate Yacht',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'The most senior superyacht command certificate of competency',
      'Requires the NZ Diploma in Yacht Operations (Level 6) with the Master Yacht strand',
    ],
  },
];

// ── Engineering ─────────────────────────────────────────────────────

const MNZ_ENGINEERING_RATINGS: MCARequirement[] = [
  {
    id: 'mnz-ewr',
    title: 'Engineroom Watch Rating (EWR)',
    regulation: 'STCW III/4',
    description: 'Engine room crew member, any propulsion power',
    category: 'Ratings',
    totalDays: 180,
    totalDaysWithRecordBook: 60,
    requirements: [
      {
        label: 'Sea Service (with training)',
        value: '60 days (2 months)',
        details: [
          'On vessels of 750 kW or more (preferred)',
          'Associated with engine room watchkeeping, under the supervision of a qualified engineer officer or rating',
        ],
      },
      {
        label: 'Sea Service (without training)',
        value: '180 days (6 months)',
        details: ['Same vessel and supervision conditions'],
      },
    ],
    notes: [
      'The training route requires the NZ Certificate in Maritime Crewing (Level 3) with engineering strand',
      'STCW basic training, and security awareness where the ISPS code applies',
      'Minimum age 16',
    ],
  },
  {
    id: 'mnz-ab-engine',
    title: 'Able Seafarer Engine (AB Engine)',
    regulation: 'STCW III/5',
    description: 'Engine room rating, any propulsion power',
    category: 'Ratings',
    totalDays: 360,
    totalDaysWithRecordBook: 180,
    requirements: [
      {
        label: 'Sea Service (with training)',
        value: '180 days (6 months)',
        details: [
          'In the engine department on vessels of 750 kW or more operating beyond restricted limits (preferred)',
        ],
      },
      {
        label: 'Sea Service (without training)',
        value: '360 days (12 months)',
        details: ['Same vessel conditions'],
      },
      {
        label: 'Prior Certificate',
        value: 'EWR',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'The training route requires the NZ Certificate in Maritime Crewing (Level 4) with engineering strand',
      'STCW basic training, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-etr',
    title: 'Electro-technical Rating (ETR)',
    regulation: 'STCW III/7',
    description: 'Electrical and control engineering support, any power',
    category: 'Ratings',
    totalDays: 360,
    totalDaysWithRecordBook: 180,
    requirements: [
      {
        label: 'Sea Service (with training)',
        value: '180 days (6 months)',
        details: ['On vessels of 750 kW or more (preferred)'],
      },
      {
        label: 'Sea Service (with an electrical qualification)',
        value: '90 days (3 months)',
        details: [
          'On vessels of 750 kW or more (preferred)',
          'Holding a Certificate in Electrical Engineering (Level 4) or an equivalent assessed by Maritime NZ',
        ],
      },
      {
        label: 'Sea Service (without training)',
        value: '360 days (12 months)',
        details: ['On vessels of 750 kW or more (preferred)'],
      },
    ],
    notes: [
      'The training route requires the NZ Certificate in Maritime Crewing (Level 4) with electro-technology strand',
      'STCW basic training, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
];

const MNZ_ENGINEERING_OFFICERS: MCARequirement[] = [
  {
    id: 'mnz-eto',
    title: 'Electro-technical Officer (ETO)',
    regulation: 'STCW III/6',
    description: 'ETO at operational level, any propulsion power',
    category: 'Engineer Officers',
    totalDays: 1080,
    totalDaysWithRecordBook: 360,
    requirements: [
      {
        label: 'Combined Workshop Skills and Sea Service',
        value: '360 days (12 months)',
        details: [
          'Including at least 180 days (6 months) on vessels of 750 kW or more (preferred)',
          'Including evidence of a participation programme with onboard training and a training record book',
        ],
      },
      {
        label: 'Sea Service (other route)',
        value: '1,080 days (36 months)',
        details: [
          'Including at least 180 days (6 months) on vessels of 750 kW or more (preferred)',
          'Including at least 900 days (30 months) in the engine department',
        ],
      },
    ],
    notes: [
      'The combined route requires the NZ Diploma in Marine Electro-technology (Level 6)',
      'STCW basic training, advanced fire fighting, survival craft and rescue boats, medical first aid, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-mec6',
    title: 'Marine Engineer Class 6 (MEC 6)',
    regulation: 'Part 32',
    description: 'Engineer on motor ships up to 3000 kW in enclosed waters',
    category: 'Engineer Officers',
    totalHours: 200,
    requirements: [
      {
        label: 'Sea Service',
        value: '200 hours',
        details: [
          'On motor ships of any kind, including pleasure craft',
          'Plus completion of an approved training record book while on board',
        ],
      },
    ],
    notes: [
      'This requirement is counted in hours, not days, so the app shows your logged hours against it',
      'Privileges range from engineer on ships up to 3000 kW in enclosed waters to second engineer on fishing ships up to 750 kW in the unlimited area',
      'Requires the NZ Certificate in Marine Engineering Class 6 (Level 4)',
      'Current first aid certificate, minimum age 18',
    ],
  },
  {
    id: 'mnz-mec5',
    title: 'Marine Engineer Class 5 (MEC 5)',
    regulation: 'STCW-F II/5',
    description: 'Engineer on motor ships, coastal, offshore and restricted',
    category: 'Engineer Officers',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service (holding MEC 6)',
        value: '360 days (12 months)',
        details: [
          'On vessels of 100 kW or more (required)',
          'While holding a current MEC 6 or equivalent',
        ],
      },
      {
        label: 'Sea Service (with training record book)',
        value: '720 days (24 months)',
        details: [
          'On vessels of 100 kW or more (required)',
          'With an approved training record book completed within the last 5 years',
        ],
      },
      {
        label: 'Sea Service (MEC 6 record book route)',
        value: '360 days plus 200 hours',
        details: [
          'On vessels of 100 kW or more (required)',
          'With an approved MEC 6 training record book completed within the last 5 years',
        ],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Marine Engineering Class 6 (Level 4) with the MEC 5 strand',
      'STCW or STCW-F basic safety training',
    ],
  },
  {
    id: 'mnz-mec5-steam',
    title: 'Marine Engineer Class 5 Steam',
    regulation: 'Part 32',
    description: 'Engineer on steam ships, restricted, coastal and offshore',
    category: 'Engineer Officers',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'Including 360 days (12 months) on steam propulsion engines or boilers on ships of any propulsion power',
        ],
      },
      {
        label: 'Operating Experience (option 2)',
        value: '1,080 days (36 months)',
        details: [
          'Including 360 days (12 months) on steam propulsion engines or boilers of a land installation',
        ],
      },
      {
        label: 'With craft or industrial training (options 3 and 4)',
        value: '360 days (12 months)',
        details: [
          'On steam engines or boilers, at sea or on a land installation',
          'Plus 2 years of craft, industrial or other practical training',
        ],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Marine Engineering Class 6 (Level 4) with the MEC 5 strand',
      'STCW or STCW-F basic safety training',
    ],
  },
  {
    id: 'mnz-mec5-motor-steam',
    title: 'Marine Engineer Class 5 Motor and Steam',
    regulation: 'Part 32',
    description: 'Engineer on motor and steam ships',
    category: 'Engineer Officers',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'Including 900 days (30 months) on diesel engines',
          'Including 180 days (6 months) on steam propulsion engines or boilers',
        ],
      },
      {
        label: 'Sea Service (option 2, holding MEC 6)',
        value: '360 days (12 months)',
        details: [
          'As an engineer on vessels of 100 kW or more while holding MEC 6 or equivalent',
          'Including 180 days (6 months) on diesel engines and 180 days (6 months) on steam engines or boilers',
        ],
      },
      {
        label: 'Sea Service (option 3)',
        value: '720 days (24 months)',
        details: [
          'As an engineer on vessels of 100 kW or more',
          'Including 540 days (18 months) on diesel engines and 180 days (6 months) on steam engines or boilers',
        ],
      },
    ],
    notes: [
      'Requires the NZ Certificate in Marine Engineering Class 6 (Level 4) with the MEC 5 strand',
      'STCW or STCW-F basic safety training',
    ],
  },
  {
    id: 'mnz-mec4',
    title: 'Marine Engineer Class 4 (MEC 4)',
    regulation: 'STCW-F II/5',
    description: 'Chief engineer on ships <24m coastal and offshore',
    category: 'Engineer Officers',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service (holding MEC 5)',
        value: '360 days (12 months)',
        details: [
          'On vessels of 250 kW or more operating beyond restricted limits (required)',
          'While holding MEC 5 or equivalent',
        ],
      },
      {
        label: 'Sea Service (with shore-based training)',
        value: '360 days (12 months)',
        details: [
          'On vessels of 250 kW or more operating beyond restricted limits (required)',
          'With evidence of completed shore-based engineering training',
        ],
      },
      {
        label: 'Sea Service (holding MEC 6)',
        value: '720 days (24 months)',
        details: [
          'On vessels of 250 kW or more operating beyond restricted limits',
          'While holding MEC 6 or equivalent',
        ],
      },
    ],
    notes: [
      'The highest engineering certificate for non-STCW ships',
      'Requires the NZ Diploma in Marine Engineering (Level 6)',
      'STCW-F basic safety training, survival craft and rescue boats, and advanced fire fighting',
      'MEC 4 and MEC 3 use the same training course; the difference is the sea service',
    ],
  },
  {
    id: 'mnz-mec3',
    title: 'Marine Engineer Class 3 (MEC 3)',
    regulation: 'STCW III/1',
    description: 'Officer in charge of an engineering watch',
    category: 'Engineer Officers',
    totalDays: 1080,
    totalDaysWithRecordBook: 360,
    requirements: [
      {
        label: 'Sea Service (cadet programme)',
        value: '360 days (12 months)',
        details: [
          'On vessels of 750 kW or more operating beyond restricted limits (preferred)',
          'Including at least 180 days (6 months) of engine room watchkeeping under the supervision of the chief engineer or a qualified engineer officer',
          'Including evidence of a completed cadet programme',
        ],
      },
      {
        label: 'Sea Service (other route)',
        value: '1,080 days (36 months)',
        details: [
          'In the engine department on vessels of 750 kW or more operating beyond restricted limits (preferred)',
          'Including at least 180 days (6 months) of supervised engine room watchkeeping',
        ],
      },
    ],
    notes: [
      'Requires the NZ Diploma in Marine Engineering (Level 6)',
      'STCW basic training, advanced fire fighting, survival craft and rescue boats, medical first aid, and security awareness where the ISPS code applies',
      'Minimum age 18',
    ],
  },
  {
    id: 'mnz-mec2-3000kw',
    title: 'Marine Engineer Class 2 <3000 kW',
    regulation: 'STCW III/3',
    description: 'Second engineer on ships <3000 kW, any area',
    category: 'Engineer Officers',
    totalDays: 360,
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days (12 months)',
        details: [
          'On vessels of 750 kW or more operating beyond restricted limits (preferred)',
          'As an assistant engineer officer or engineer officer',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'MEC 3',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Requires the Masters and Chiefs Foreign Going programme, Second Engineer Foreign Going strand',
      'STCW basic safety training, advanced fire fighting, survival craft and rescue boats, medical first aid, and security awareness where the ISPS code applies',
    ],
  },
  {
    id: 'mnz-mec2',
    title: 'Marine Engineer Class 2 (MEC 2)',
    regulation: 'STCW III/2',
    description: 'Second engineer, any propulsion power, any area',
    category: 'Engineer Officers',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of an Engineering Watch',
        value: '360 days (12 months)',
        details: [
          'On vessels of 750 kW or more operating beyond restricted limits (required)',
          'As officer in charge of an engineering watch',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'MEC 3',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Also chief engineer on fishing ships of any propulsion power in any operating area',
      'Requires the Masters and Chiefs Foreign Going programme, Second Engineer Foreign Going strand',
    ],
  },
  {
    id: 'mnz-mec2-ece',
    title: 'MEC 2 Endorsed Chief Engineer (MEC 2 ECE)',
    regulation: 'STCW III/3',
    description: 'Chief engineer on ships <3000 kW, any area',
    category: 'Engineer Officers',
    totalDays: 720,
    requirements: [
      {
        label: 'Sea Service',
        value: '720 days (24 months)',
        details: [
          'On vessels of 750 kW or more operating beyond restricted limits (preferred)',
          'Including at least 360 days (12 months) while holding MEC 3 or a higher certificate',
          'Including 360 days (12 months) as engineer watchkeeper on vessels of 750 kW or more beyond restricted limits (preferred)',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'MEC 3 or higher',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'Requires the Masters and Chiefs Foreign Going programme, Second Engineer Foreign Going strand',
    ],
  },
  {
    id: 'mnz-mec1',
    title: 'Marine Engineer Class 1 (MEC 1)',
    regulation: 'STCW III/2',
    description: 'Chief engineer, any propulsion power, any area',
    category: 'Engineer Officers',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (option 1)',
        value: '1,080 days (36 months)',
        details: [
          'On vessels of 750 kW or more (required) operating beyond restricted limits (preferred)',
          'As officer in charge of an engineering watch while holding MEC 3 or a higher certificate',
        ],
      },
      {
        label: 'Sea Service (option 2)',
        value: '720 days (24 months)',
        details: [
          'On vessels of 750 kW or more (required) operating beyond restricted limits (preferred)',
          'Including at least 360 days (12 months) as second engineer while holding MEC 2',
          'Remaining time as officer in charge of an engineering watch',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'MEC 3, MEC 2 or MEC 2 ECE',
        details: ['Or an equivalent certificate'],
      },
    ],
    notes: [
      'The most senior engineering officer certificate',
      'Requires the Masters and Chiefs Foreign Going programme, Chief Engineer Foreign Going strand',
    ],
  },
];

export const MNZ_DECK_REQUIREMENTS: MCARequirement[] = [
  ...MNZ_DECK_RESTRICTED,
  ...MNZ_DECK_COASTAL,
  ...MNZ_DECK_FISHING,
  ...MNZ_DECK_UNLIMITED,
  ...MNZ_DECK_YACHT,
];

export const MNZ_ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  ...MNZ_ENGINEERING_RATINGS,
  ...MNZ_ENGINEERING_OFFICERS,
];

/**
 * How Maritime NZ counts service, for the definitions panel. SeaCert is written
 * in months of service inside a 10-year window, which is a different shape from
 * both the MCA yacht definitions and the USCG ones.
 */
export const MNZ_SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    title: 'The 10-Year Window',
    description:
      'Unless a certificate says otherwise, all approved sea service must be gained in the 10 years immediately before you apply. The app counts your service inside that window and shows anything older separately, because it will not be accepted as it stands.',
    department: 'both',
  },
  {
    title: 'Months and Days',
    description:
      'Sea service is stated in months and a month is 30 days, so 12 months is 360 days. Every figure in the requirements list is converted on that basis.',
    department: 'both',
  },
  {
    title: 'Hours, for SRL and MEC 6',
    description:
      'Two certificates are counted in hours rather than months. Skipper Restricted Limits and Marine Engineer Class 6 each ask for 200 hours on board, so the app measures those two against your logged hours.',
    department: 'both',
  },
  {
    title: 'Required and Preferred Service',
    description:
      'Where a requirement names a vessel size, length, tonnage or power, it is marked either required or preferred. Required service must be gained exactly as stated. Preferred service on that size of vessel is likely to be approved, and service on other sizes is considered case by case.',
    department: 'both',
  },
  {
    title: 'Training Record Books',
    description:
      'Most certificates have a shorter sea service route for applicants who completed an approved training record book, a cadet programme or the relevant course. The app measures you against the shorter figure when you tell it you hold one.',
    department: 'both',
  },
  {
    title: 'Service in Restricted Limits',
    description:
      'Service on a ship operating only in restricted limits that must be crewed by holders of unlimited certificates is treated as STCW sea service. That covers the deck department of a ship of 3,000 GT or more, and the engine department of a ship with 3,000 kW or more of main propulsion power.',
    department: 'both',
  },
  {
    title: 'Warship Service',
    description:
      'Sea service aboard warships is recognised in full for engineering certificates, and navigational watchkeeping time aboard warships is recognised in full as well.',
    department: 'both',
  },
  {
    title: 'Yacht Service',
    description:
      'The superyacht certificates are written in the same split the app records. Chief Mate Yacht can be met with 500 days of actual sea service plus 230 days of any combination of actual, stand-by and yard service, and the Master Yacht certificates ask for 120 or 240 days of watchkeeping inside the total.',
    department: 'deck',
  },
  {
    title: 'Pleasure Craft',
    description:
      'Time on a pleasure craft counts toward Skipper Restricted Limits and Master Yacht <24 metres only where you were acting as skipper at the time. MEC 6 accepts motor ships of any kind, including pleasure craft.',
    department: 'both',
  },
  {
    title: 'Documenting Your Service',
    description:
      'Service is evidenced when you apply, alongside your training records, any approved training record book (TARbook), medical and eyesight results, and the fit and proper person form.',
    department: 'both',
  },
];
