
export interface MCARequirement {
  id: string;
  title: string;
  regulation: string;
  description: string;
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
// Based on 46 CFR Part 10 & Part 11 (amended March 2026)
// Sea service: 1 day = any part of a day on a documented vessel

const USCG_DECK_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'uscg-mate-200grt',
    title: 'Mate of Vessels <200 GRT',
    regulation: '46 CFR 11.241',
    description: 'Near coastal or inland waters',
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days',
        details: [
          'On ocean or near coastal waters',
          'On vessels of appropriate tonnage',
          '90 days in the preceding 3 years',
        ],
      },
    ],
    notes: [
      'Requires USCG-approved training or examination',
      'Sea service documented on Form CG-719B with vessel name, official number, dates, capacity',
    ],
  },
  {
    id: 'uscg-master-100grt',
    title: 'Master of Vessels <100 GRT',
    regulation: '46 CFR 11.201',
    description: 'Near coastal',
    requirements: [
      {
        label: 'Sea Service',
        value: '720 days',
        details: [
          '360 days on ocean or near coastal waters',
          'On vessels of appropriate tonnage',
        ],
      },
    ],
  },
  {
    id: 'uscg-master-1600grt',
    title: 'Master of Vessels <1600 GRT',
    regulation: '46 CFR 11.205',
    description: 'Oceans or near coastal',
    requirements: [
      {
        label: 'Sea Service',
        value: '1,080 days',
        details: [
          'Total sea service on ocean or near coastal vessels',
          '180 days as mate or equivalent',
          '720 days while holding a license as mate',
        ],
      },
    ],
  },
];

const USCG_ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  {
    id: 'uscg-asst-engineer',
    title: 'Assistant Engineer',
    regulation: '46 CFR 11.503',
    description: 'Unlimited horsepower',
    requirements: [
      {
        label: 'Sea Service',
        value: '1,080 days',
        details: [
          'In the engine department on vessels of appropriate horsepower',
          'Service as a qualified member of the engine department (QMED)',
        ],
      },
    ],
  },
  {
    id: 'uscg-chief-engineer-limited',
    title: 'Chief Engineer - Limited',
    regulation: '46 CFR 11.512',
    description: 'Vessels <1000 HP',
    requirements: [
      {
        label: 'Sea Service',
        value: '720 days',
        details: [
          'In the engine department on vessels of appropriate horsepower',
          '360 days as assistant engineer or equivalent',
        ],
      },
    ],
  },
  {
    id: 'uscg-designated-duty-engineer',
    title: 'Designated Duty Engineer (DDE)',
    regulation: '46 CFR 11.514',
    description: 'Vessels <500 GRT / <1000 HP',
    requirements: [
      {
        label: 'Sea Service',
        value: '360 days',
        details: [
          'In the engine department',
          'On vessels of appropriate tonnage and horsepower',
        ],
      },
    ],
    notes: [
      'Most common entry-level USCG engineering credential for small vessels',
      'Requires USCG-approved training or examination',
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
