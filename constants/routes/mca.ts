import type { CertRoute } from '../certRoutes';

/**
 * MCA certificate routes, keyed by requirement id. Months are 30 days
 * (MSN 1904 5.2, MSN 1858). The first route of each list is the default and
 * mirrors the certificate's own figures.
 */
export const MCA_ROUTES: Record<string, CertRoute[]> = {
  // MSN 1904 sections 4.3 to 4.7 (commercial gates) and 5.9.1 (yacht table).
  'eoow-sv': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: 'Diploma in Maritime Studies: Small Vessel Engineer at an MCA approved college',
      source: 'MSN 1904 4.3',
    },
    {
      id: 'experienced',
      label: 'Experienced Seafarer route',
      summary: 'Already serving on small vessels: no Diploma, register with an MCA approved college',
      source: 'MSN 1904 4.4, 4.5, 5.9.1',
      engineGates: [
        { label: 'Entry: Onboard Service, 200 kW+', kind: 'onboard', minKw: 200, days: 720 },
        { label: 'Entry: Seagoing Service, 200 kW+', kind: 'seagoing', minKw: 200, days: 180 },
        { label: 'After Registration: Seagoing, 350 kW+', kind: 'seagoing', minKw: 350, days: 330, afterStart: true },
        { label: 'After Registration: Watch or UMS, 350 kW+', kind: 'watch', minKw: 350, days: 180, afterStart: true },
      ],
      yachtBars: [
        { label: 'Entry: Onboard Service', kind: 'onboard', days: 720 },
        { label: 'Entry: Seagoing Service', kind: 'seagoing', days: 180 },
        { label: 'After Registration: Onboard', kind: 'onboard', days: 360, afterStart: true },
        { label: 'After Registration: Seagoing', kind: 'seagoing', days: 240, afterStart: true },
        { label: 'After Registration: Watchkeeping', kind: 'watch', days: 180, afterStart: true },
      ],
      startDate: { label: 'Date you registered with an MCA approved college', scope: 'marked' },
      caveat:
        'Entry service must be in the engine department, and cleaning duties alone do not count. Up to 90 days of yard time can count toward the total (MSN 1904 5.5.2).',
    },
    {
      id: 'alt-degree',
      label: 'Degree, approved HND or apprenticeship',
      summary:
        'Engineering degree, MCA approved HND in Marine Engineering, or NVQ level 3+ engineering apprenticeship',
      source: 'MSN 1904 4.7.7 (a)(i), 5.9.1',
      engineGates: [
        { label: 'Seagoing Service, 350 kW+', kind: 'seagoing', minKw: 350, days: 330 },
        { label: 'Watchkeeping or UMS, 350 kW+', kind: 'watch', minKw: 350, days: 180 },
      ],
      yachtBars: [
        { label: 'Onboard Service', kind: 'onboard', days: 360 },
        { label: 'Seagoing Service', kind: 'seagoing', days: 240 },
        { label: 'Watchkeeping / UMS', kind: 'watch', days: 180 },
      ],
      startDate: { label: 'Date of your college Action Plan', scope: 'all' },
      caveat:
        'The qualification must be in a relevant subject (MSN 1904 4.7.1). Qualifications from outside the UK need an ENIC letter.',
    },
    {
      id: 'alt-hnd',
      label: 'HND or Advanced Diploma',
      summary: 'HND or Advanced Diploma in a relevant engineering subject, not MCA approved for marine engineering',
      source: 'MSN 1904 4.7.7 (a)(ii), 5.9.1',
      engineGates: [
        { label: 'Seagoing Service, 350 kW+', kind: 'seagoing', minKw: 350, days: 420 },
        { label: 'Watchkeeping or UMS, 350 kW+', kind: 'watch', minKw: 350, days: 180 },
      ],
      yachtBars: [
        { label: 'Onboard Service', kind: 'onboard', days: 420 },
        { label: 'Seagoing Service', kind: 'seagoing', days: 270 },
        { label: 'Watchkeeping / UMS', kind: 'watch', days: 180 },
      ],
      startDate: { label: 'Date of your college Action Plan', scope: 'all' },
      caveat:
        'The yacht table gives 9 to 15 months seagoing for this route; the bar shows the minimum. Must be from the UK or an EU state.',
    },
    {
      id: 'alt-hnc',
      label: 'HNC or Advanced Certificate',
      summary: 'HNC or Advanced Certificate in a relevant engineering subject',
      source: 'MSN 1904 4.7.7 (a)(iii), 5.9.1',
      engineGates: [
        { label: 'Seagoing Service, 350 kW+', kind: 'seagoing', minKw: 350, days: 510 },
        { label: 'Watchkeeping or UMS, 350 kW+', kind: 'watch', minKw: 350, days: 180 },
      ],
      yachtBars: [
        { label: 'Onboard Service', kind: 'onboard', days: 510 },
        { label: 'Seagoing Service', kind: 'seagoing', days: 330 },
        { label: 'Watchkeeping / UMS', kind: 'watch', days: 180 },
      ],
      startDate: { label: 'Date of your college Action Plan', scope: 'all' },
      caveat:
        'The yacht table gives 11 to 15 months seagoing for this route; the bar shows the minimum. Must be from the UK or an EU state.',
    },
  ],
  // MSN 1904 section 3: 24 months as engineer, or 36 months dual purpose.
  'meol-sv': [
    {
      id: 'standard',
      label: 'Engineer route',
      summary: '24 months as the engineer responsible for system maintenance',
      source: 'MSN 1904 3',
    },
    {
      id: 'dual-purpose',
      label: 'Dual-purpose deckhand and engineer',
      summary: '36 months working as both deckhand and engineer',
      source: 'MSN 1904 3',
      engineGates: [
        { label: 'Onboard Service, 200 kW+', kind: 'onboard', minKw: 200, days: 1080 },
        { label: 'Seagoing Service, 200 kW+', kind: 'seagoing', minKw: 200, days: 180 },
      ],
      caveat: 'At least 6 months of the seagoing service must be in the engineering department.',
    },
  ],
  // MSN 1904 5.9.1 yacht table: from the Chief <500 GT CoC the yacht figures
  // halve. On commercial vessels the 12 months stands (4.10, footnote 21).
  'chief-engineer-sv-3000gt': [
    {
      id: 'standard',
      label: 'From SV EOOW',
      summary: 'Serving as SV EOOW <9,000 kW, <3,000 GT',
      source: 'MSN 1904 4.10',
    },
    {
      id: 'from-chief-500',
      label: 'From SV Chief Engineer <500 GT, on yachts',
      summary: 'Working on yachts and already holding SV Chief Engineer <3,000 kW, <500 GT',
      source: 'MSN 1904 5.9.1, 5.9.2',
      yachtBars: [
        { label: 'Onboard Service', kind: 'onboard', days: 180 },
        { label: 'Watch or UMS, in Full Charge', kind: 'watch', days: 120 },
      ],
      caveat:
        'Yacht service only: on commercial vessels the full 12 months still applies. Yard time counts for at most 25% or 3 months, whichever is less (MSN 1904 5.5.4).',
    },
  ],

  // MSN 1863 2.1 (b) and 2.2: special training, or prior engineering training
  // the MCA accepts, cuts the service to 2 months.
  'engine-room-watch-rating': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '6 months seagoing in the engine department',
      source: 'MSN 1863 2.1 (b)',
    },
    {
      id: 'special-training',
      label: 'Special training route',
      summary: 'Following an MCA approved or accepted training programme, or with prior engineering training the MCA accepts',
      source: 'MSN 1863 2.1 (b), 2.2',
      engineGates: [{ label: 'Rating Service, 350 kW+', kind: 'rating', minKw: 350, days: 60 }],
      caveat:
        'Prior engineering training (apprenticeship, Royal Navy) must be assessed by the MCA first, and it decides whether the 2 months applies.',
    },
  ],
  // MSN 1863 3.1 (c): 12 months plus the Engine Course, or 6 months plus the Diploma.
  'able-seafarer-engine': [
    {
      id: 'standard',
      label: 'Engine Course route',
      summary: '12 months as a rating plus an MCA approved Engine Course',
      source: 'MSN 1863 3.1 (c)',
    },
    {
      id: 'diploma',
      label: 'Diploma route',
      summary: 'Diploma in Maritime Studies Able Seafarer Engine Room (MSQ/MSA)',
      source: 'MSN 1863 3.1 (c)',
      engineGates: [{ label: 'Rating Service, 350 kW+', kind: 'rating', minKw: 350, days: 180 }],
      caveat: 'The service must be while qualified as an Engine Room Watch Rating. The bar counts all your rating service, so check the dates.',
    },
  ],
  // MSN 1857 10.2 (c). Route I (apprenticeship) has service set by an examiner
  // and route III (hold Able Seafarer Engine) needs none, so neither is here.
  'meol-merchant': [
    {
      id: 'standard',
      label: 'Diploma and rating route',
      summary: 'Diploma (level 2) Able Seafarer Engine plus service as a trainee or ERWR',
      source: 'MSN 1857 10.2 (c) II',
    },
    {
      id: 'shore-engineering',
      label: 'Shore engineering route',
      summary: '24 months shore employment in engineering the MCA accepts, plus the Approved Engine Course',
      source: 'MSN 1857 10.2 (c) IV',
      engineGates: [{ label: 'Seagoing Service, 200 kW+', kind: 'seagoing', minKw: 200, days: 90 }],
      caveat: 'The service must be as a trainee marine engine operator. The app cannot check your 24 months of shore employment.',
    },
  ],

  // MSN 1858 3.3 note, as amended by MIN 521: no Training Record Book with 36
  // months actual seagoing service on yachts of 24m or more.
  'oow-yachts-3000gt': [
    {
      id: 'standard',
      label: 'Training Record Book route',
      summary: 'Completing an MCA Yacht Training Record Book',
      source: 'MSN 1858 3.3 (c), (f)',
    },
    {
      id: 'no-trb',
      label: 'Without a Training Record Book',
      summary: '36 months actual seagoing service on yachts of 24m or more instead of the Training Record Book',
      source: 'MSN 1858 3.3, MIN 521 1.2',
      // 3.3 (c) still applies, but 1080 days actual seagoing meets the 36 months
      // onboard and the 250 + 115 split on its own (the 115 can all be seagoing),
      // so the standby and yard bar is left out: it would ask for days this
      // route does not need.
      yachtBars: [
        { label: 'Onboard Yacht Service', kind: 'onboard', days: 1080 },
        { label: 'Actual Seagoing Service, Yachts 24m+', kind: 'seagoing', days: 1080 },
      ],
      caveat:
        'All of the seagoing service must be on vessels of at least 24m load line length, which the app does not check. The MCA "may" waive the book on this basis; every other OOW requirement still applies.',
    },
  ],

  // MGN 495 10.2 (a): special training (MSQ units, Annex B) cuts it to 2 months.
  'tug-watch-rating': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '6 months tug service in the deck department',
      source: 'MGN 495 10.2 (a) i',
    },
    {
      id: 'special-training',
      label: 'Special training route',
      summary: 'Completed MCA approved special training (MSQ units, MGN 495 Annex B)',
      source: 'MGN 495 10.2 (a) ii, Annex A',
      tugRoute: { tugDays: 60 },
      caveat: 'Annex A describes this as service as a supernumerary deck apprentice on an MCA or BTA approved scheme.',
    },
  ],
};
