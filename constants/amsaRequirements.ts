import type { MCARequirement, ServiceDefinition } from './mcaRequirements';

/**
 * AMSA pathways.
 *
 * Domestic (near coastal) certificates come from Marine Order 505 (Certificates
 * of competency — national law) 2022, which replaced the pre-2023 framework on
 * 1 January 2023. The certificates the app used to list (Master <35m, Master
 * <80m, "Marine Engineer Near Coastal") are not issued under that order; the
 * current ladder is Coxswain grade 3/2/1, Master <24m, Master (Inland waters),
 * Master <45m, Master <100m, and on the engineering side Marine Engine Driver
 * grade 3/2/1 then Engineer Class 3.
 *
 * International certificates are the STCW ones AMSA issues, including the four
 * yacht certificates, which are the closest thing an Australian yacht officer
 * has to the MCA pathway the app was built around.
 *
 * Nearly every AMSA certificate has two sea-service figures: a shorter one if
 * the applicant holds a completed AMSA task book, and a longer one without.
 * `totalDaysWithRecordBook` carries the shorter figure and `totalDays` the
 * longer, so the progress card can measure against whichever the user says
 * applies to them.
 */

// ── Deck: near coastal (Marine Order 505) ───────────────────────────

const AMSA_DECK_NEAR_COASTAL: MCARequirement[] = [
  {
    id: 'amsa-gph-nc',
    title: 'General Purpose Hand Near Coastal',
    regulation: 'MO 505',
    description: 'Deck and engine work under supervision',
    category: 'Near Coastal',
    totalDays: 5,
    requirements: [
      {
        label: 'Sea Service',
        value: '5 days',
        details: [
          'On commercial vessels of any size',
          'Assisting with deck and engine work under the general supervision of the master, chief engineer or a qualified crew member',
        ],
      },
    ],
    notes: [
      'Requires Certificate I in Maritime Operations (General Purpose Hand Near Coastal)',
      'First aid (HLTAID011), medical and eyesight assessment, minimum age 16',
      'Service is evidenced on form 771, a task book, an operator or master letter, or an approved sea service log book',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-coxswain-3-nc',
    title: 'Coxswain Grade 3 Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <12m, up to 6 people, within 1 nautical mile',
    category: 'Near Coastal',
    totalDays: 1,
    requirements: [
      {
        label: 'Sea Service (recreational licence route)',
        value: '1 day',
        details: [
          'One day of qualifying sea service on a commercial vessel, where the training route used is a recreational boat licence',
          'Not required where the applicant completes the maritime training units or an approved powerboat course instead',
        ],
      },
      {
        label: 'Vessel and Area Limits',
        value: '<12m, <100 kW inboard',
        details: [
          'Inboard engines under 100 kW, or outboard under 250 kW',
          'Up to 6 people on board',
          'Within 1 nautical mile of shore, in smooth or inland waters, or within a marina',
        ],
      },
    ],
    notes: [
      'Training route is MARI003, MARK007 and MARN008, an Australian Sailing powerboat handling course, RYA Level 2 Powerboat, or a recreational boat licence plus one day of commercial sea service',
      'First aid (HLTAID011), medical fitness, minimum age 16',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-coxswain-2-nc',
    title: 'Coxswain Grade 2 Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <12m in sheltered waters, within 5 nautical miles',
    category: 'Near Coastal',
    totalDays: 50,
    totalDaysWithRecordBook: 10,
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '10 days',
        details: ['On commercial or recreational vessels'],
      },
      {
        label: 'Sea Service (without task book)',
        value: '50 days',
        details: ['On commercial or recreational vessels'],
      },
      {
        label: 'Vessel and Area Limits',
        value: '<12m, <100 kW inboard',
        details: [
          'Inboard engines under 100 kW, or any outboard engine',
          'Sheltered waters, within 5 nautical miles of shore or an aquaculture lease, or 3 nautical miles as a tender',
        ],
      },
    ],
    notes: [
      'Requires Certificate I in Maritime Operations and the AMSA Mandated Practical Assessment (AMPA)',
      'First aid (HLTAID011), medical fitness, minimum age 16',
      'A 500 kW endorsement extends command to inboard propulsion up to 500 kW',
      'A ferry-in-chains endorsement needs a further 20 days on that type of vessel',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-coxswain-1-nc',
    title: 'Coxswain Grade 1 Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <12m in inshore waters',
    category: 'Near Coastal',
    totalDays: 150,
    totalDaysWithRecordBook: 30,
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '30 days',
        details: ['On commercial vessels of 5 metres or more'],
      },
      {
        label: 'Sea Service (without task book)',
        value: '150 days',
        details: ['On commercial or recreational vessels of 5 metres or more'],
      },
      {
        label: 'Vessel and Area Limits',
        value: '<12m, <500 kW inboard',
        details: [
          'Inboard engines under 500 kW, or any outboard engine',
          'Inshore waters and areas designated by a state or territory, or within 3 nautical miles as a tender',
        ],
      },
    ],
    notes: [
      'Requires Certificate II in Maritime Operations and the AMSA Mandated Practical Assessment (AMPA)',
      'Marine radio SROCP, first aid (HLTAID011), medical fitness, minimum age 16',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-master-inland-nc',
    title: 'Master (Inland Waters) Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <45m in inland waters',
    category: 'Near Coastal',
    totalDays: 120,
    totalDaysWithRecordBook: 60,
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '60 days',
        details: [
          'On commercial vessels',
          'In a deck, or deck and engineering, capacity',
          'On vessels of 7.5 metres or more',
        ],
      },
      {
        label: 'Sea Service (without task book)',
        value: '120 days',
        details: [
          'On commercial or recreational vessels',
          'In a deck, or deck and engineering, capacity',
          'On vessels of 7.5 metres or more',
        ],
      },
    ],
    notes: [
      'Commands a commercial vessel under 45 metres in inland waters, and covers General Purpose Hand duties',
      'Requires Certificate III in Maritime Operations and the AMSA Mandated Practical Assessment (AMPA)',
      'First aid (HLTAID011), medical fitness, minimum age 16',
      'A ferry-in-chains endorsement needs a further 20 days on that type of vessel',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-master-24m-nc',
    title: 'Master <24m Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <24m within the EEZ',
    category: 'Near Coastal',
    totalDays: 360,
    totalDaysWithRecordBook: 120,
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '120 days',
        details: [
          'On commercial vessels of 7.5 metres or more',
          'In a deck, or deck and engineering, role',
          'A day is 8 hours of qualifying work',
        ],
      },
      {
        label: 'Sea Service (without task book)',
        value: '360 days',
        details: [
          'At least half on commercial vessels',
          'On vessels of 7.5 metres or more',
        ],
      },
    ],
    notes: [
      'Requires Certificate III in Maritime Operations (Master up to 24m Near Coastal) and the AMSA Mandated Practical Assessment (AMPA)',
      'Marine radio LROCP or higher, first aid (HLTAID011), medical fitness, minimum age 16',
      'No more than 15 per cent of deck service can be gained while the vessel is not underway',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-master-45m-nc',
    title: 'Master <45m Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <45m within the EEZ',
    category: 'Near Coastal',
    totalDays: 360,
    totalDaysWithRecordBook: 180,
    watchkeepingDays: 240,
    watchkeepingDaysWithRecordBook: 120,
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '180 days',
        details: ['Of which at least 120 days in charge of a navigational watch'],
      },
      {
        label: 'Sea Service (without task book)',
        value: '360 days',
        details: ['Of which at least 240 days in charge of a navigational watch'],
      },
      {
        label: 'Prior Certificate',
        value: 'Master <24m NC',
        details: [
          'Service must be gained while holding Master less than 24 metres near coastal, or a recognised prior Mate certificate',
        ],
      },
    ],
    notes: [
      'Replaced the Master <35m near coastal certificate from 1 January 2023; existing Master <35m holders keep their certificate and it still counts as a prior certificate',
      'Requires Certificate IV in Maritime Operations (Master up to 45m Near Coastal)',
      'Marine radio LROCP, first aid (HLTAID011), medical fitness, minimum age 16',
      'Also permits work on larger vessels in restricted waters',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-master-100m-nc',
    title: 'Master <100m Near Coastal',
    regulation: 'MO 505',
    description: 'Vessels <100m within the EEZ',
    category: 'Near Coastal',
    totalDays: 360,
    totalDaysWithRecordBook: 180,
    watchkeepingDays: 240,
    watchkeepingDaysWithRecordBook: 120,
    requirements: [
      {
        label: 'From Master <45m or Master <35m (with task book)',
        value: '180 days',
        details: ['Of which at least 120 days in charge of a navigational watch'],
      },
      {
        label: 'From Master <45m or Master <35m (without task book)',
        value: '360 days',
        details: ['Of which at least 240 days in charge of a navigational watch'],
      },
      {
        label: 'From Mate <80m or another non-command certificate (with task book)',
        value: '360 days',
        details: ['Of which at least 120 days in charge of a navigational watch'],
      },
      {
        label: 'From Mate <80m or another non-command certificate (without task book)',
        value: '720 days',
        details: ['Of which at least 240 days in charge of a navigational watch'],
      },
    ],
    notes: [
      'Permits master, chief mate or deck watchkeeper on commercial vessels up to 100 metres within the EEZ',
      'Requires a Diploma of Maritime Operations',
      'Marine radio LROCP, first aid (HLTAID011), medical fitness, minimum age 16',
      'Revalidation asks for 120 days as officer of the watch in the last 5 years, or an approved final assessment, or 60 days in the last 6 months',
      'Certificate is valid for 5 years',
    ],
  },
];

// ── Deck: sailing (near coastal) ────────────────────────────────────

const AMSA_DECK_SAILING: MCARequirement[] = [
  {
    id: 'amsa-sailing-master-coastal-nc',
    title: 'Sailing Master Coastal Near Coastal',
    regulation: 'MO 505',
    description: 'Sailing vessels <24m in inshore waters',
    category: 'Sailing',
    requirements: [
      {
        label: 'Sailing Qualification',
        value: 'RYA or IYT',
        details: [
          'Commercially endorsed RYA Yachtmaster Coastal, or IYT Master of Yachts Coastal',
          'The sea service sits inside that qualification rather than being counted separately by AMSA',
        ],
      },
      {
        label: 'Engine Competency',
        value: 'One of several',
        details: [
          'Coxswain Grade 1 NC, or Marine Engine Driver Grade 3 NC',
          'Or RYA Diesel Engine combined with a powerboat qualification, or equivalent',
        ],
      },
      {
        label: 'Vessel and Area Limits',
        value: '<24m, <100 kW',
        details: [
          'Sailing vessels under 24 metres with propulsion under 100 kW, carrying passengers, in inshore waters',
          'Also chief mate or deck watchkeeper on sailing vessels under 45 metres in inshore waters, and tenders under 100 kW',
        ],
      },
    ],
    notes: [
      'Marine radio SROCP, first aid, medical fitness',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-sailing-master-offshore-nc',
    title: 'Sailing Master Offshore Near Coastal',
    regulation: 'MO 505',
    description: 'Sailing vessels <24m within the EEZ',
    category: 'Sailing',
    requirements: [
      {
        label: 'Sailing Qualification',
        value: 'RYA or IYT',
        details: [
          'Commercially endorsed RYA Yachtmaster Offshore, RYA Yachtmaster Ocean, or IYT Master of Yachts Limited',
          'The sea service sits inside that qualification rather than being counted separately by AMSA',
        ],
      },
      {
        label: 'Engine Competency',
        value: 'One of several',
        details: [
          'Coxswain Grade 1 NC or Marine Engine Driver Grade 3 NC',
          'Or MAR037, or an RYA Diesel Engine and powerboat combination, or an IYT Boat Engineer route',
        ],
      },
      {
        label: 'Vessel and Area Limits',
        value: '<24m, <100 kW',
        details: [
          'Sailing vessels under 24 metres with propulsion under 100 kW, up to 12 passengers beyond inshore waters, within the EEZ',
          'Also chief mate or deck watchkeeper on sailing vessels under 45 metres in the EEZ, and tenders under 100 kW',
        ],
      },
    ],
    notes: [
      'Marine radio LROCP, first aid (HLTAID011), medical fitness, minimum age 16',
      'Certificate is valid for 5 years',
    ],
  },
];

// ── Deck: international (STCW) yacht certificates ───────────────────

const AMSA_DECK_YACHT: MCARequirement[] = [
  {
    id: 'amsa-wkd-3000gt-yachts',
    title: 'Watchkeeper Deck <3000 GT (Yachts)',
    regulation: 'STCW II/1',
    description: 'Watchkeeper on yachts <3000 GT, any operating area',
    category: 'International (Yachts)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Watchkeeping Service',
        value: '1,080 days (36 months)',
        details: [
          'On vessels of 12 metres or more',
          'Including at least 240 days (8 months) on vessels of 20 metres or more on voyages of 24 hours or more',
          'Of that, at least 180 days (6 months) as understudy to the officer in charge of the navigational watch',
        ],
      },
    ],
    notes: [
      'Requires the Watchkeeper deck <3000 GT (yachts) course plus basic safety training including security awareness, and proficiency in survival craft and rescue boats',
      'GMDSS radio operator certificate or certificate of recognition, and an ECDIS endorsement where the yacht is fitted with ECDIS',
      'AMSA Certificate of Medical Fitness (form 303), taken in Australia with an AMSA-approved practitioner',
      'Applications are made on Seafarer form 419',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-chief-mate-3000gt-yachts',
    title: 'Chief Mate <3000 GT (Yachts)',
    regulation: 'STCW II/2',
    description: 'Chief mate on yachts <3000 GT, any operating area',
    category: 'International (Yachts)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Watchkeeping Service',
        value: '1,080 days (36 months)',
        details: [
          'On vessels of 12 metres or more',
          'Including at least 240 days (8 months) on vessels of 20 metres or more on voyages of 24 hours or more',
          'Of that, at least 180 days (6 months) as understudy to the officer in charge of the navigational watch',
        ],
      },
      {
        label: 'Watchkeeping Service (approved course)',
        value: '540 days (18 months)',
        details: [
          'Where the service forms part of an approved course',
          'Same 240-day and 180-day components apply',
        ],
      },
    ],
    notes: [
      'Requires the Chief mate <3000 GT (yachts) course, basic safety training including security awareness, advanced fire fighting, proficiency in survival craft and rescue boats, and medical first aid',
      'GMDSS certificate, ECDIS endorsement where fitted, and AMSA Certificate of Medical Fitness (form 303)',
      'Sea service is assessed first, then an oral examination follows the approval letter',
    ],
  },
  {
    id: 'amsa-master-500gt-yachts',
    title: 'Master <500 GT (Yachts)',
    regulation: 'STCW II/2',
    description: 'Master on yachts <500 GT, any operating area',
    category: 'International (Yachts)',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '360 days (12 months)',
        details: [
          'On vessels of 12 metres or more',
          'Including at least 120 days (4 months) on vessels of 20 metres or more',
          'Including at least 120 days (4 months) on voyages of 24 hours or more',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Watchkeeper Deck <3000 GT (Yachts)',
        details: ['Or an equivalent certificate accepted by AMSA'],
      },
    ],
    notes: [
      'Requires the Master <500 GT (yachts) course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, medical care, navigational watch rating and ECDIS',
      'GMDSS certificate and AMSA Certificate of Medical Fitness (form 303)',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-master-3000gt-yachts',
    title: 'Master <3000 GT (Yachts)',
    regulation: 'STCW II/2',
    description: 'Master on yachts <3000 GT, any operating area',
    category: 'International (Yachts)',
    totalDays: 720,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '720 days (24 months)',
        details: [
          'On vessels of 12 metres or more',
          'Including at least 240 days (8 months) on vessels of 20 metres or more',
          'Gained while holding the qualifying certificate',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'Master <500 GT (Yachts)',
        details: ['Or an equivalent certificate accepted by AMSA'],
      },
    ],
    notes: [
      'A yacht here is a vessel in commercial use for sport or pleasure that carries no cargo and no more than 12 passengers',
      'Requires the Master <500 GT (yachts) course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, medical care on board, and ECDIS',
      'GMDSS certificate and AMSA Certificate of Medical Fitness (form 303)',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months, plus refresher fire fighting and survival craft within 5 years',
    ],
  },
];

// ── Deck: international (STCW) ──────────────────────────────────────

const AMSA_DECK_INTERNATIONAL: MCARequirement[] = [
  {
    id: 'amsa-wkd-500gt',
    title: 'Watchkeeper Deck <500 GT',
    regulation: 'STCW II/3',
    description: 'Deck watchkeeper on vessels <500 GT',
    category: 'International (Deck)',
    requirements: [
      {
        label: 'Qualifying Sea Service',
        value: 'Assessed on application',
        details: [
          'Watchkeeping service documented as qualifying sea service',
          'AMSA assesses the service against the STCW II/3 standard rather than publishing a single day figure',
        ],
      },
      {
        label: 'Revalidation Service',
        value: '360 days (12 months)',
        details: [
          'In the preceding 5 years, or 90 days (3 months) in the preceding 6 months',
        ],
      },
    ],
    notes: [
      'Requires the Watchkeeper deck <500 GT course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical first aid',
      'GMDSS certificate, ECDIS endorsement where fitted, and AMSA Certificate of Medical Fitness (form 303)',
      'Applications are made on Seafarer form 419 and are followed by an oral examination',
    ],
  },
  {
    id: 'amsa-mate-500gt',
    title: 'Mate <500 GT',
    regulation: 'STCW II/3',
    description: 'Chief mate or watchkeeper on vessels <500 GT',
    category: 'International (Deck)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Watchkeeping Service',
        value: '1,080 days (36 months)',
        details: [
          'In the deck department on ships of 12 metres or more',
          'Including at least 720 days (24 months) as master or officer in charge of a navigational watch',
          'Including at least 360 days (12 months) on ships of 24 metres or more on voyages of 24 hours or more',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'One of several',
        details: [
          'Watchkeeper deck <500 GT',
          'Or an unrestricted Master <24m near coastal',
          'Or an equivalent certificate recognised by AMSA',
        ],
      },
    ],
    notes: [
      'Permits chief mate or deck watchkeeper on vessels under 500 GT anywhere, master under 500 GT near coastal, and watchkeeper under 3,000 GT near coastal',
      'Requires the Mate course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical care on board',
      'GMDSS certificate and an ECDIS endorsement where fitted',
    ],
  },
  {
    id: 'amsa-wkd',
    title: 'Watchkeeper Deck',
    regulation: 'STCW II/1',
    description: 'Deck watchkeeper, any tonnage, any operating area',
    category: 'International (Deck)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (approved training programme)',
        value: '360 days (12 months)',
        details: [
          'On voyages of 24 hours or more',
          'Including at least 180 days (6 months) as understudy to the officer in charge of a navigational watch',
        ],
      },
      {
        label: 'Sea Service (other routes)',
        value: '540 to 1,080 days',
        details: [
          '540 to 720 days (18 to 24 months) on vessels of 500 GT or more inside an approved programme',
          'Or 1,080 days (36 months) on vessels of 24 metres or more',
        ],
      },
    ],
    notes: [
      'Permits deck watchkeeper on ships of any size in any operating area, and Able Seafarer Deck functions',
      'Requires the Watchkeeper deck course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical first aid',
      'GMDSS certificate, ECDIS endorsement where fitted, and AMSA Certificate of Medical Fitness (form 303)',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-master-500gt',
    title: 'Master <500 GT',
    regulation: 'STCW II/2',
    description: 'Master on vessels <500 GT, any operating area',
    category: 'International (Deck)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (standard route)',
        value: '1,080 days (36 months)',
        details: [
          'In the deck department on vessels of 24 metres or more',
          'Including at least 720 days on voyages over 24 hours',
          'Including at least 360 days while holding the qualifying officer certificate',
        ],
      },
      {
        label: 'Sea Service (reduced route)',
        value: '720 days (24 months)',
        details: [
          'Where the applicant holds Mate <500 GT with a Chief mate <3000 GT near coastal endorsement',
          'Including at least 480 days on extended voyages',
          'Including at least 360 days while holding that Mate certificate',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'One of several',
        details: [
          'AMSA Master <45m near coastal (unrestricted)',
          'Or AMSA Mate <500 GT',
          'Or an equivalent overseas STCW certificate',
        ],
      },
    ],
    notes: [
      'Requires a Diploma of Maritime Operations (Master up to 500 GT) with an AMSA-approved provider, plus the STCW short courses',
      'GMDSS certificate and AMSA Certificate of Medical Fitness (form 303)',
    ],
  },
  {
    id: 'amsa-chief-mate-3000gt',
    title: 'Chief Mate <3000 GT',
    regulation: 'STCW II/2',
    description: 'Chief mate on vessels <3000 GT, any operating area',
    category: 'International (Deck)',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '360 days (12 months)',
        details: [
          'On ships of 24 metres or more',
          'On voyages of at least 24 hours',
          'Gained while holding the qualifying certificate',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'One of several',
        details: [
          'Master <100m near coastal, Watchkeeper deck <500 GT, Mate <500 GT, Watchkeeper deck, or a recognised foreign equivalent',
        ],
      },
    ],
    notes: [
      'Permits chief mate under 3,000 GT in any operating area, deck watchkeeper on any tonnage, and master under 500 GT with the appropriate endorsement',
      'Requires the Chief mate <3000 GT course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical care on board',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-chief-mate',
    title: 'Chief Mate',
    regulation: 'STCW II/2',
    description: 'Chief mate, any tonnage, any operating area',
    category: 'International (Deck)',
    totalDays: 360,
    requirements: [
      {
        label: 'Service in Charge of a Navigational Watch',
        value: '360 days (12 months)',
        details: [
          'On ships of 500 GT or more',
          'On voyages of at least 24 hours',
          'Gained while holding the equivalent qualifying certificate',
        ],
      },
    ],
    notes: [
      'Permits chief mate on any tonnage in any operating area, and with endorsement master under 500 GT anywhere or under 3,000 GT near coastal',
      'Requires the Chief mate course, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical care on board',
      'GMDSS certificate and AMSA Certificate of Medical Fitness (form 303)',
      'Applications are made on Seafarer form 419',
    ],
  },
  {
    id: 'amsa-master-3000gt',
    title: 'Master <3000 GT',
    regulation: 'STCW II/2',
    description: 'Master on vessels <3000 GT, any operating area',
    category: 'International (Deck)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (standard route)',
        value: '1,080 days (36 months)',
        details: ['Including at least 720 days (24 months) on voyages of 24 hours or more'],
      },
      {
        label: 'Sea Service (experienced route)',
        value: '720 days (24 months)',
        details: ['Including at least 360 days (12 months) as chief mate or master'],
      },
      {
        label: 'Prior Certificate',
        value: 'Chief Mate or Chief Mate <3000 GT',
        details: ['Held as an AMSA certificate'],
      },
    ],
    notes: [
      'Requires an Advanced Diploma of Maritime Operations (Master unlimited) with an AMSA-approved provider, plus the STCW short courses',
      'GMDSS certificate and AMSA Certificate of Medical Fitness (form 303)',
    ],
  },
  {
    id: 'amsa-master',
    title: 'Master (Unlimited)',
    regulation: 'STCW II/2',
    description: 'Master, any tonnage, any operating area',
    category: 'International (Deck)',
    totalDays: 1080,
    requirements: [
      {
        label: 'Sea Service (standard route)',
        value: '1,080 days (36 months)',
        details: [
          'On vessels of 500 GT or more',
          'Including at least 720 days on voyages of 24 hours or more',
          'Including at least 180 days on vessels of 1,500 GT or more',
          'Including at least 360 days holding an AMSA chief mate or master certificate',
        ],
      },
      {
        label: 'Sea Service (reduced route)',
        value: '720 days (24 months)',
        details: [
          'On vessels of 500 GT or more, all on voyages of 24 hours or more',
          'Including at least 180 days on vessels of 1,500 GT or more',
          'Including at least 360 days as chief mate or master while holding the qualifying AMSA certificate',
        ],
      },
      {
        label: 'Prior Certificate',
        value: 'One of several',
        details: ['Master <3000 GT, Chief Mate, or Chief Mate <3000 GT'],
      },
    ],
    notes: [
      'Requires an Advanced Diploma of Maritime Operations (Master unlimited) plus the STCW short courses',
      'GMDSS certificate and AMSA Certificate of Medical Fitness (form 303)',
    ],
  },
];

// ── Engineering: near coastal (Marine Order 505) ────────────────────

const AMSA_ENGINEERING_NEAR_COASTAL: MCARequirement[] = [
  {
    id: 'amsa-med3-nc',
    title: 'Marine Engine Driver Grade 3 Near Coastal',
    regulation: 'MO 505',
    description: 'Chief engineer on inboard engines <500 kW',
    category: 'Near Coastal',
    totalDays: 60,
    totalDaysWithRecordBook: 20,
    requirements: [
      {
        label: 'Sea Service (with task book)',
        value: '20 days',
        details: [
          'As a general purpose hand, coxswain or engineer assistant on commercial vessels of at least 75 kW propulsion power',
          'At least half on vessels with inboard diesel engines',
        ],
      },
      {
        label: 'Sea Service (without task book)',
        value: '60 days',
        details: ['At least half on vessels with inboard diesel engines'],
      },
    ],
    notes: [
      'Permits chief engineer on inboard engines under 500 kW or any outboard, second engineer under 750 kW, and engine room work up to 3,000 kW',
      'Requires Certificate II in Maritime Operations (Marine Engine Driver Grade 3) and the AMSA Mandated Practical Assessment (AMPA)',
      'Medical fitness (form 1850), first aid (HLTAID011), minimum age 16',
      'No more than 33 per cent of engineering service can be gained while the vessel is not underway',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-med2-nc',
    title: 'Marine Engine Driver Grade 2 Near Coastal',
    regulation: 'MO 505',
    description: 'Chief engineer on inboard engines <750 kW',
    category: 'Near Coastal',
    totalDays: 360,
    totalDaysWithRecordBook: 180,
    requirements: [
      {
        label: 'With workshop skill equivalent and task book',
        value: '90 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'With workshop skill equivalent, no task book',
        value: '180 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'Without workshop skill equivalent, with task book',
        value: '180 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'Without workshop skill equivalent, no task book',
        value: '360 days',
        details: ['In an engineering role on commercial vessels'],
      },
    ],
    notes: [
      'Permits chief engineer on inboard engines under 750 kW or any outboard, second engineer under 1,500 kW, and engine room assistance up to 3,000 kW',
      'Requires Certificate III in Maritime Operations (Marine Engine Driver Grade 2 Near Coastal) and the AMSA Mandated Practical Assessment (AMPA)',
      'Medical fitness, first aid (HLTAID011), minimum age 16',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-med1-nc',
    title: 'Marine Engine Driver Grade 1 Near Coastal',
    regulation: 'MO 505',
    description: 'Chief engineer on inboard engines <1500 kW',
    category: 'Near Coastal',
    totalDays: 240,
    totalDaysWithRecordBook: 120,
    requirements: [
      {
        label: 'From MED Grade 2 (with task book)',
        value: '120 days',
        details: [
          'As an engineer, or assisting an engineer, on commercial vessels with inboard engines of at least 375 kW propulsion power',
        ],
      },
      {
        label: 'From a workshop skill equivalent (with task book)',
        value: '90 days',
        details: ['Same vessel and power conditions'],
      },
      {
        label: 'From MED Grade 2 (without task book)',
        value: '240 days',
        details: ['Same vessel and power conditions'],
      },
      {
        label: 'From a workshop skill equivalent (without task book)',
        value: '180 days',
        details: ['Same vessel and power conditions'],
      },
    ],
    notes: [
      'Permits chief engineer on inboard engines under 1,500 kW, or second engineer under 3,000 kW',
      'Requires Certificate IV in Maritime Operations (Marine Engine Driver Grade 1 Near Coastal)',
      'Medical fitness, first aid (HLTAID011), minimum age 16',
      'Certificate is valid for 5 years',
    ],
  },
  {
    id: 'amsa-engineer-class3-nc',
    title: 'Engineer Class 3 Near Coastal',
    regulation: 'MO 505',
    description: 'Chief engineer on inboard engines <3000 kW',
    category: 'Near Coastal',
    totalDays: 360,
    totalDaysWithRecordBook: 180,
    requirements: [
      {
        label: 'From MED Grade 1 (with task book)',
        value: '180 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'From a workshop skill equivalent (with task book)',
        value: '120 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'From an AMSA Engineer Watchkeeper certificate (with task book)',
        value: '90 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'From MED Grade 1 (without task book)',
        value: '360 days',
        details: ['In an engineering role on commercial vessels'],
      },
      {
        label: 'From a workshop skill equivalent (without task book)',
        value: '240 days',
        details: ['In an engineering role on commercial vessels'],
      },
    ],
    notes: [
      'Permits chief engineer or assistant on vessels with inboard engines under 3,000 kW, or outboard engines of unlimited power',
      'The prior certificate must be held before the qualifying sea service starts',
      'Requires a Diploma of Marine Engineering and a final oral examination with an AMSA examiner',
      'Medical fitness, first aid (HLTAID011), minimum age 16',
      'Certificate is valid for 5 years',
    ],
  },
];

// ── Engineering: international (STCW) ───────────────────────────────

const AMSA_ENGINEERING_INTERNATIONAL: MCARequirement[] = [
  {
    id: 'amsa-engineer-watchkeeper',
    title: 'Engineer Watchkeeper',
    regulation: 'STCW III/1',
    description: 'Engineer watchkeeper, any propulsion power',
    category: 'International (Engineering)',
    totalDays: 252,
    requirements: [
      {
        label: 'Engineer Cadet or Trainee Engineer',
        value: '252 days (36 weeks)',
        details: [
          'On vessels of 750 kW or more',
          'Including 182 days (26 weeks) of watchkeeping duties under supervision',
          'Cadet programmes run for a minimum of 3 years',
        ],
      },
      {
        label: 'Holding an unrestricted Engineer Class 3',
        value: '182 days (26 weeks)',
        details: ['On vessels of 750 kW or more while holding that certificate'],
      },
    ],
    notes: [
      'Permits engineer watchkeeper on ships of any propulsion power in any operating area, and with endorsement second or chief engineer on smaller vessels',
      'Requires an approved course of study, basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical first aid',
      'AMSA Certificate of Medical Fitness (form 303)',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-eto',
    title: 'Electro-technical Officer',
    regulation: 'STCW III/6',
    description: 'ETO on ships of any propulsion power',
    category: 'International (Engineering)',
    totalDays: 180,
    requirements: [
      {
        label: 'Sea Service',
        value: '180 days (6 months)',
        details: [
          'On ships with at least 750 kW of total installed electrical generating capacity',
          'Gained as part of an approved training programme',
        ],
      },
    ],
    notes: [
      'Requires approved ETO workshop skills training and a completed training record book where service was gained after 1 April 2014',
      'Basic safety training including security awareness, advanced fire fighting, survival craft and rescue boats, and medical first aid',
      'AMSA Certificate of Medical Fitness (form 303), taken in Australia',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-engineer-class2',
    title: 'Engineer Class 2',
    regulation: 'STCW III/2',
    description: 'Second engineer, any propulsion power',
    category: 'International (Engineering)',
    totalDays: 720,
    requirements: [
      {
        label: 'From Engineer Watchkeeper',
        value: '360 days (12 months)',
        details: [
          'On ships of 750 kW or more while holding an Engineer Watchkeeper certificate',
          'Including 270 days (9 months) on the same propulsion type',
        ],
      },
      {
        label: 'From Engineer Class 3',
        value: '720 days (24 months)',
        details: [
          'On ships of 750 kW or more while holding Engineer Class 3',
          'Including 270 days (9 months) on the same propulsion type',
        ],
      },
    ],
    notes: [
      'Permits first engineer officer or engineer watchkeeper on any vessel, and chief engineer on ships under 3,000 kW',
      'Prior certificate: Engineer Watchkeeper, Engineer Class 3 Near Coastal, a state unrestricted Engineer Class 3 issued before 1 July 2013, or an equivalent STCW III/1 certificate',
      'Requires the Engineer Class 2 course plus the STCW short courses',
      'Revalidation asks for 12 months in the preceding 5 years, or 3 months in the preceding 6 months',
    ],
  },
  {
    id: 'amsa-engineer-class1',
    title: 'Engineer Class 1',
    regulation: 'STCW III/2',
    description: 'Chief engineer, any propulsion power',
    category: 'International (Engineering)',
    totalDays: 1080,
    requirements: [
      {
        label: 'From Engineer Class 2 (standard route)',
        value: '1,080 days (36 months)',
        details: [
          'In charge of an engine room watch on ships of 750 kW or more',
          'Including 360 days (12 months) on ships of 3,000 kW or more',
          'Including 360 days (12 months) while holding Engineer Class 2',
        ],
      },
      {
        label: 'From Engineer Class 2 (reduced route)',
        value: '720 days (24 months)',
        details: [
          'In charge of an engine room watch on ships of 750 kW or more',
          'Including 360 days (12 months) as first engineer on ships of 3,000 kW or more',
        ],
      },
      {
        label: 'From Engineer Class 3',
        value: '1,260 days (42 months)',
        details: [
          'In charge of an engine room watch on ships of 750 kW or more',
          'Including 540 days (18 months) on ships of 3,000 kW or more',
          'Including 720 days (24 months) while holding Engineer Class 3',
        ],
      },
    ],
    notes: [
      'Permits chief engineer on ships of any propulsion power in any operating area',
      'Requires the Engineer Class 1 course plus the STCW short courses, and an oral examination',
      'AMSA Certificate of Medical Fitness (form 303)',
    ],
  },
];

export const AMSA_DECK_REQUIREMENTS: MCARequirement[] = [
  ...AMSA_DECK_NEAR_COASTAL,
  ...AMSA_DECK_SAILING,
  ...AMSA_DECK_YACHT,
  ...AMSA_DECK_INTERNATIONAL,
];

export const AMSA_ENGINEERING_REQUIREMENTS: MCARequirement[] = [
  ...AMSA_ENGINEERING_NEAR_COASTAL,
  ...AMSA_ENGINEERING_INTERNATIONAL,
];

/**
 * How AMSA counts service, for the definitions panel. The MCA yacht definitions
 * the app ships (MSN 1858 / MSN 1904) do not apply to an AMSA applicant, so an
 * AMSA user is shown these instead.
 */
export const AMSA_SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    title: 'A Day of Sea Service',
    description:
      'Eight hours of work that relates to the certificate you are applying for. Shifts shorter than eight hours are added together until they make a day. More than eight hours inside one 24-hour period is still one day, so a long day never credits as more than one.',
    department: 'both',
  },
  {
    title: 'Months and Years',
    description:
      'A month is 30 days. Every month figure in the requirements list is converted on that basis, so 12 months is 360 days.',
    department: 'both',
  },
  {
    title: 'Task Books',
    description:
      'Holding a completed AMSA task book roughly halves the sea service for most certificates. The app measures you against the task book figure when you tell it you hold one, and against the longer figure when you do not.',
    department: 'both',
  },
  {
    title: 'Service While Not Underway',
    description:
      'Time on board while the vessel is neither underway nor at anchor with a watch is capped: no more than 15 per cent of the required service for a deck certificate, and no more than 33 per cent for an engineering certificate. The app counts those days separately so you can see how much of your allowance is left.',
    department: 'both',
  },
  {
    title: 'Deck Duties',
    description:
      'Navigation, chart work, mooring, anchoring and cargo handling. In charge of a navigational watch means commanding the navigation of the vessel, which excludes general purpose hands, trainees, and anyone working under direct supervision.',
    department: 'deck',
  },
  {
    title: 'Engineering Duties',
    description:
      'Operating or maintaining machinery for propulsion, mooring, anchoring or cargo work, recorded as assistant engineer, watchkeeper, engineer or engineer in charge.',
    department: 'engineering',
  },
  {
    title: 'Service on Privately Owned Yachts',
    description:
      'AMSA accepts commercial sea service on a privately owned luxury yacht where you were in paid employment doing duties relevant to the certificate. You provide the vessel’s safety management system documentation or crew lists, plus an owner’s letter, contract or pay slips, alongside the usual sea service evidence.',
    department: 'both',
  },
  {
    title: 'Vessel Size and Power',
    description:
      'Near coastal certificates are gated on vessel length and propulsion power rather than tonnage: 5 metres for Coxswain, 7.5 metres for Master <24m, and 375 kW for Marine Engine Driver Grade 1. Record both on each vessel so the app can tell which of your service counts.',
    department: 'both',
  },
  {
    title: 'Documenting Your Service',
    description:
      'Near coastal service is recorded on form 771, on a signed supervisor letter, or in an approved task book. Where supervisor signatures cannot be obtained, form 771 is submitted with a statutory declaration naming every vessel and affirming the record is accurate.',
    department: 'both',
  },
];
