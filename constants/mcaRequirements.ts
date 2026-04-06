
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

export const getRequirementById = (id: string): MCARequirement | undefined => {
  return MCA_REQUIREMENTS.find((req) => req.id === id);
};

export const getRequirementTitles = (): { id: string; title: string }[] => {
  return MCA_REQUIREMENTS.map((req) => ({ id: req.id, title: req.title }));
};
