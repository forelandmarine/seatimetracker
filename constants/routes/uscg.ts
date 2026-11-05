import type { CertRoute } from '../certRoutes';

/**
 * USCG certificate routes, keyed by requirement id. USCG progress is measured
 * on creditable days only (46 CFR 10.107), so a route here changes `totalDays`
 * and nothing else. A month is 30 days and a year 360 days (46 CFR 10.107).
 * The first route of each list is the default and mirrors the certificate's
 * own figures. Routes that need a credential already held say so in `caveat`,
 * because the app cannot check what the user holds.
 */
export const USCG_ROUTES: Record<string, CertRoute[]> = {
  // ── Ocean & near-coastal ─────────────────────────────────────────

  // 46 CFR 11.404(a) and (b): Great Lakes and inland unlimited Masters cross over with 24 months.
  'uscg-master-onc-unlimited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '1 year as Chief Mate on ocean vessels',
      source: '46 CFR 11.404(a)',
    },
    {
      id: 'gl-inland-master',
      label: 'Great Lakes or inland Master crossover',
      summary: 'Holders of Master of Great Lakes and inland, or inland, unlimited tonnage',
      source: '46 CFR 11.404(b)',
      totalDays: 720,
      caveat:
        'Service must be under the authority of that Master endorsement, and the prescribed examination is required. Inland service other than the Great Lakes counts for up to half the total.',
    },
  ],

  // 46 CFR 11.407(a)(1) and (c).
  'uscg-third-mate-onc-unlimited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years of deck service on ocean vessels, including 6 months of bridge watchkeeping',
      source: '46 CFR 11.407(a)(1)',
    },
    {
      id: 'master-1600',
      label: 'Master under 1,600 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 1,600 GRT',
      source: '46 CFR 11.407(c)',
      totalDays: 360,
      caveat:
        'All of it as Master on vessels of more than 200 GRT on ocean or near-coastal waters, while holding Master under 1,600 GRT.',
    },
  ],

  // 46 CFR 11.412(a)(1) and (a)(2).
  'uscg-master-onc-1600grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '4 years of service, including 2 years as Master or Mate',
      source: '46 CFR 11.412(a)(1)',
    },
    {
      id: 'mate-or-towing',
      label: 'Mate under 1,600 GRT or towing holder',
      summary: 'Holders of Mate (oceans) under 1,600 GRT, or Master or Mate of Towing Vessels',
      source: '46 CFR 11.412(a)(2)',
      totalDays: 360,
      caveat:
        'All of it as Master or Mate on vessels of more than 100 GRT on ocean or near-coastal waters, while holding that endorsement.',
    },
  ],

  // 46 CFR 11.418(a)(1), (a)(2) and (b).
  'uscg-master-onc-500grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years of service, including 2 years as Master or Mate',
      source: '46 CFR 11.418(a)(1)',
    },
    {
      id: 'mate-500',
      label: 'Mate under 500 GRT',
      summary: 'Holders of Mate (oceans) under 500 GRT',
      source: '46 CFR 11.418(a)(2)',
      totalDays: 360,
      caveat:
        'All of it as Master or Mate on vessels of more than 50 GRT on ocean or near-coastal waters, while holding Mate (oceans) under 500 GRT.',
    },
    {
      id: 'towing',
      label: 'Towing route',
      summary: 'Holders of Master or Mate (Pilot) of Towing Vessels with an ocean or near-coastal route',
      source: '46 CFR 11.418(b)',
      totalDays: 360,
      caveat:
        'All of it as Master or Mate of Towing Vessels on ocean or near-coastal routes. A limited examination is required.',
    },
  ],

  // 46 CFR 11.424(a)(1) and (a)(2).
  'uscg-master-ocean-200grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years of service, including 2 years as Master or Mate',
      source: '46 CFR 11.424(a)(1)',
    },
    {
      id: 'towing',
      label: 'Towing route',
      summary: 'Masters and Mates of ocean or near-coastal towing vessels',
      source: '46 CFR 11.424(a)(2)',
      totalDays: 720,
      caveat: 'All of it as Master or Mate of ocean or near-coastal towing vessels. An examination is required.',
    },
  ],

  // 46 CFR 11.426(a)(1) and (a)(2).
  'uscg-master-nc-200grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '2 years of service, including 1 year as Master or Mate',
      source: '46 CFR 11.426(a)(1)',
    },
    {
      id: 'towing',
      label: 'Towing route',
      summary: 'Masters and Mates of Towing Vessels on ocean or near-coastal routes',
      source: '46 CFR 11.426(a)(2)',
      totalDays: 360,
      caveat:
        'All of it as Master or Mate of Towing Vessels on ocean or near-coastal routes. An examination is required.',
    },
  ],

  // 46 CFR 11.425(a)(1) and (a)(2).
  'uscg-mate-ocean-200grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '12 months of deck service on ocean or near-coastal vessels',
      source: '46 CFR 11.425(a)(1)',
    },
    {
      id: 'inland-master',
      label: 'Inland Master under 200 GRT',
      summary: 'Holders of Master of inland vessels under 200 GRT',
      source: '46 CFR 11.425(a)(2)',
      totalDays: 90,
      caveat:
        'Deck service on self-propelled vessels on any waters, while holding Master (inland) under 200 GRT.',
    },
  ],

  // 46 CFR 11.427(a)(1) and (a)(2).
  'uscg-mate-nc-200grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '12 months of deck service on ocean or near-coastal vessels',
      source: '46 CFR 11.427(a)(1)',
    },
    {
      id: 'inland-master',
      label: 'Inland Master under 200 GRT',
      summary: 'Holders of Master of inland vessels under 200 GRT',
      source: '46 CFR 11.427(a)(2)',
      totalDays: 90,
      caveat:
        'Deck service on self-propelled vessels on any waters, while holding Master (inland) under 200 GRT.',
    },
  ],

  // ── Great Lakes & inland ─────────────────────────────────────────

  // 46 CFR 11.433(a)(1) and (a)(2). The (a)(3) route is also 1 year, so it is not listed.
  'uscg-master-gl-inland-unlimited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '1 year acting as First Mate on Great Lakes vessels of 1,600 GRT or more',
      source: '46 CFR 11.433(a)(1)',
    },
    {
      id: 'inland-master',
      label: 'Inland Master route',
      summary: 'Masters of vessels of 1,600 GRT or more on inland waters other than the Great Lakes',
      source: '46 CFR 11.433(a)(2)',
      totalDays: 720,
      caveat: 'All of it as Master of self-propelled vessels of 1,600 GRT or more on inland waters, excluding the Great Lakes.',
    },
  ],

  // 46 CFR 11.435(a)(1) and (a)(2).
  'uscg-master-inland-unlimited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '1 year as Mate or First-Class Pilot on vessels of 1,600 GRT or more',
      source: '46 CFR 11.435(a)(1)',
    },
    {
      id: 'bridge-watch',
      label: 'Bridge watchkeeping route',
      summary: 'Mates and First-Class Pilots keeping a supervised bridge watch',
      source: '46 CFR 11.435(a)(2)',
      totalDays: 720,
      caveat:
        'All of it on bridge watchkeeping duties under the supervision of the Master or a qualified officer, while holding Mate or First-Class Pilot.',
    },
  ],

  // 46 CFR 11.437(a)(1) and (a)(3). Great Lakes Maritime Academy graduation has no day figure.
  'uscg-mate-gl-inland-unlimited': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years of deck service, including 6 months of bridge watchkeeping',
      source: '46 CFR 11.437(a)(1)',
    },
    {
      id: 'master-1600',
      label: 'Master under 1,600 GRT',
      summary: 'Holders of Master (Great Lakes and inland) under 1,600 GRT',
      source: '46 CFR 11.437(a)(3)',
      totalDays: 360,
      caveat:
        'All of it as Master on vessels of 200 GRT or more, while holding Master (Great Lakes and inland) under 1,600 GRT. A tonnage limitation may apply.',
    },
  ],

  // 46 CFR 11.442(a)(1) and (a)(2).
  'uscg-master-gl-inland-1600grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years of service, including 1 year as Master or Mate on vessels of 100 GRT or more',
      source: '46 CFR 11.442(a)(1)',
    },
    {
      id: 'towing-master',
      label: 'Master of Towing Vessels',
      summary: 'Holders of Master of Towing Vessels',
      source: '46 CFR 11.442(a)(2)',
      totalDays: 180,
      caveat: 'All of it as operator on vessels of 100 GRT or more, while holding Master of Towing Vessels.',
    },
  ],

  // 46 CFR 11.444(a)(1) to (a)(3).
  'uscg-mate-gl-inland-1600grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '2 years of deck service, including 6 months of bridge watchkeeping',
      source: '46 CFR 11.444(a)(1)',
    },
    {
      id: 'master-200-oupv',
      label: 'Master under 200 GRT or OUPV',
      summary: 'Holders of Master under 200 GRT or OUPV',
      source: '46 CFR 11.444(a)(2)',
      totalDays: 360,
      caveat:
        'All of it as Master or OUPV on vessels of 50 GRT or more, while holding Master under 200 GRT or OUPV.',
    },
    {
      id: 'towing-mate',
      label: 'Mate (Pilot) of Towing Vessels',
      summary: 'Mates (Pilots) of Towing Vessels on vessels of 100 GRT or more',
      source: '46 CFR 11.444(a)(3)',
      totalDays: 180,
      caveat: 'All of it as Mate (Pilot) of Towing Vessels on vessels of 100 GRT or more.',
    },
  ],

  // 46 CFR 11.446(a)(1) and (b): the towing route needs 3 1/2 years in all.
  'uscg-master-gl-inland-500grt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years of service, including 1 year as Master or Mate on vessels of 50 GRT or more',
      source: '46 CFR 11.446(a)(1)',
    },
    {
      id: 'towing-master',
      label: 'Master of Towing Vessels',
      summary: 'Holders of Master of Towing Vessels on any route',
      source: '46 CFR 11.446(b)',
      totalDays: 1260,
      caveat:
        'Includes 6 months as Master of Towing Vessels, and 2 years while holding Master or Mate (Pilot) of Towing Vessels, or Mate. A limited examination is required.',
    },
  ],

  // ── Towing vessels ───────────────────────────────────────────────

  // 46 CFR 11.465(a) table 1 and (f).
  'uscg-mate-pilot-towing': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '30 months of service, including 12 months as Apprentice Mate of Towing Vessels',
      source: '46 CFR 11.465(a)',
    },
    {
      id: 'master-200',
      label: 'Master under 200 GRT',
      summary: 'Holders of any Master endorsement under 200 GRT, other than Limited Master',
      source: '46 CFR 11.465(f)',
      totalDays: 1080,
      caveat:
        'All of it as Master under that endorsement. Also needs a TOAR, the Apprentice Mate examination and 30 days of training and observation on towing vessels.',
    },
  ],

  // ── Uninspected passenger vessels ────────────────────────────────

  // 46 CFR 11.467(e), (f) and (g).
  'uscg-oupv-inland': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '12 months of experience operating vessels',
      source: '46 CFR 11.467(e)',
    },
    {
      id: 'limited',
      label: 'Limited OUPV',
      summary: 'Operators employed by camps, yacht clubs, educational institutions or marinas',
      source: '46 CFR 11.467(f)',
      totalDays: 90,
      caveat:
        'Service must be operating the type of vessel the endorsement is for. Needs an approved safe boating course and a limited examination, and the endorsement is limited to that activity and locality.',
    },
    {
      id: 'restricted',
      label: 'Restricted OUPV',
      summary: 'Operators on specific inland bodies of water approved by the OCMI',
      source: '46 CFR 11.467(g)',
      totalDays: 90,
      caveat:
        'At the OCMI\'s discretion. The 90 days must be on each body of water requested, operating the type of vessel, and an examination is required.',
    },
  ],

  // ── Offshore supply vessels ──────────────────────────────────────

  // 46 CFR 11.497(a)(1) and (a)(2).
  'uscg-mate-osv': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '24 months of deck service, including 1 year on vessels over 100 GRT',
      source: '46 CFR 11.497(a)(1)',
    },
    {
      id: 'training-programme',
      label: 'Approved training programme',
      summary: 'Cadets on an approved or accepted Mate-OSV training programme',
      source: '46 CFR 11.497(a)(2)',
      totalDays: 360,
      caveat: 'Only service as part of the approved or accepted programme counts.',
    },
  ],

  // ── Mobile offshore drilling units ───────────────────────────────

  // 46 CFR 11.470(b)(1) and (c).
  'uscg-oim': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '4 years assigned to MODUs, including 1 year in a supervisory position',
      source: '46 CFR 11.470(b)(1)(i)',
    },
    {
      id: 'degree',
      label: 'Engineering degree route',
      summary: 'Holders of an ABET accredited engineering or engineering technology degree',
      source: '46 CFR 11.470(b)(1)(ii)',
      totalDays: 168,
      caveat:
        'All of it in a supervisory position on MODUs, with at least 14 days on surface units for the unrestricted and surface unit endorsements.',
    },
    {
      id: 'master-chief-mate',
      label: 'Unlimited Master or Chief Mate',
      summary: 'Holders of an unlimited Master or Chief Mate endorsement',
      source: '46 CFR 11.470(c), (e), (i)',
      totalDays: 112,
      caveat:
        'OIM Unrestricted needs 84 days on surface units and 28 days on bottom bearing units. Surface units on location needs only the 84 days, and bottom bearing units on location only the 28.',
    },
  ],

  // 46 CFR 11.472(a)(1) and (b).
  'uscg-barge-supervisor': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years assigned to MODUs, including 168 days in a supervisory position',
      source: '46 CFR 11.472(a)(1)(i)',
    },
    {
      id: 'degree',
      label: 'Engineering degree route',
      summary: 'Holders of an ABET accredited engineering or engineering technology degree',
      source: '46 CFR 11.472(a)(1)(ii)',
      totalDays: 168,
      caveat:
        'All of it in a supervisory position on MODUs, with at least 84 days as Ballast Control Operator or Barge Supervisor trainee.',
    },
    {
      id: 'master-mate',
      label: 'Unlimited Master or Mate',
      summary: 'Holders of an unlimited Master or Mate endorsement',
      source: '46 CFR 11.472(b)',
      totalDays: 84,
      caveat: 'All of it as Ballast Control Operator or Barge Supervisor trainee.',
    },
  ],

  // 46 CFR 11.474(a)(1) and (b).
  'uscg-ballast-control-operator': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '1 year assigned to MODUs, including 28 days as a supervised trainee',
      source: '46 CFR 11.474(a)(1)(i)',
    },
    {
      id: 'degree',
      label: 'Engineering degree route',
      summary: 'Holders of an ABET accredited engineering or engineering technology degree',
      source: '46 CFR 11.474(a)(1)(ii)',
      totalDays: 28,
      caveat: 'All of it as a trainee supervised by an endorsed Ballast Control Operator.',
    },
    {
      id: 'officer',
      label: 'Unlimited officer route',
      summary: 'Holders of an unlimited Master, Mate, Chief Engineer or Assistant Engineer endorsement',
      source: '46 CFR 11.474(b)',
      totalDays: 28,
      caveat: 'All of it as a trainee supervised by an endorsed Ballast Control Operator.',
    },
  ],

  // ── STCW deck ────────────────────────────────────────────────────

  // 46 CFR 11.305(a)(1) and (d). National Master unlimited and Master OSV need no further service.
  'uscg-stcw-master-3000gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months as OICNW',
      source: '46 CFR 11.305(a)(1)',
    },
    {
      id: 'chief-mate',
      label: 'With 12 months as Chief Mate',
      summary: 'Officers who have served at least 12 months as Chief Mate',
      source: '46 CFR 11.305(a)(1)',
      totalDays: 720,
      caveat: 'At least 360 days of the 720 must be as Chief Mate.',
    },
    {
      id: 'stcw-master-500-3000',
      label: 'STCW Master 500 to 3,000 GT',
      summary: 'Holders of STCW Master of vessels of 500 GT or more and less than 3,000 GT',
      source: '46 CFR 11.305(d)',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that STCW endorsement.',
    },
  ],

  // 46 CFR 11.307(d). The table 1 national routes need 12 months, the same as the standard route.
  'uscg-stcw-chief-mate-3000gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '12 months as OICNW',
      source: '46 CFR 11.307(a)(1)',
    },
    {
      id: 'stcw-chief-mate-500-3000',
      label: 'STCW Chief Mate 500 to 3,000 GT',
      summary: 'Holders of STCW Chief Mate of vessels of 500 GT or more and less than 3,000 GT',
      source: '46 CFR 11.307(d)',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that STCW endorsement.',
    },
  ],

  // 46 CFR 11.309(a)(1) and table 1 to 11.309(e).
  'uscg-stcw-oicnw-500gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months of seagoing deck service, including 6 months of bridge watchkeeping',
      source: '46 CFR 11.309(a)(1)(i)',
    },
    {
      id: 'training-programme',
      label: 'Approved training programme',
      summary: 'Cadets on an approved programme with onboard training meeting Section A-II/1',
      source: '46 CFR 11.309(a)(1)(ii)',
      totalDays: 360,
      caveat:
        'Only seagoing service within the approved programme counts. The 6 months of supervised bridge watchkeeping still applies.',
    },
    {
      id: 'national-master-500',
      label: 'National Master under 500 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 500 GRT',
      source: '46 CFR 11.309(e) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
    {
      id: 'national-mate-500',
      label: 'National Mate under 500 GRT',
      summary: 'Holders of Mate (oceans or near-coastal) under 500 GRT',
      source: '46 CFR 11.309(e) table 1',
      totalDays: 360,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
    {
      id: 'national-mate-osv',
      label: 'Mate-OSV',
      summary: 'Holders of a Mate-OSV endorsement',
      source: '46 CFR 11.309(e) table 1',
      totalDays: 360,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
    {
      id: 'national-mate-towing',
      label: 'Mate of Towing Vessels',
      summary: 'Holders of Mate of Towing Vessels (oceans or near-coastal)',
      source: '46 CFR 11.309(e) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // 46 CFR 11.311(a)(1) and table 1 to 11.311(d).
  'uscg-stcw-master-500-3000gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months as OICNW',
      source: '46 CFR 11.311(a)(1)',
    },
    {
      id: 'chief-mate',
      label: 'With 12 months as Chief Mate',
      summary: 'Officers who have served at least 12 months as Chief Mate',
      source: '46 CFR 11.311(a)(1)',
      totalDays: 720,
      caveat: 'At least 360 days of the 720 must be as Chief Mate.',
    },
    {
      id: 'national-master-500',
      label: 'National Master under 500 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 500 GRT',
      source: '46 CFR 11.311(d) table 1',
      totalDays: 360,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
    {
      id: 'national-master-towing',
      label: 'Master of Towing Vessels',
      summary: 'Holders of Master of Towing Vessels (oceans or near-coastal)',
      source: '46 CFR 11.311(d) table 1',
      totalDays: 360,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // Table 1 to 46 CFR 11.313(d).
  'uscg-stcw-chief-mate-500-3000gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '12 months as OICNW',
      source: '46 CFR 11.313(a)(1)',
    },
    {
      id: 'national-master-500',
      label: 'National Master under 500 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 500 GRT',
      source: '46 CFR 11.313(d) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
    {
      id: 'national-master-towing',
      label: 'Master of Towing Vessels',
      summary: 'Holders of Master of Towing Vessels (oceans or near-coastal)',
      source: '46 CFR 11.313(d) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // 46 CFR 11.315(a)(1) and table 1 to 11.315(d).
  'uscg-stcw-master-under-500gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months of seagoing service as OICNW',
      source: '46 CFR 11.315(a)(1)',
    },
    {
      id: 'chief-mate',
      label: 'With 12 months as Chief Mate',
      summary: 'Officers who have served at least 12 months as Chief Mate',
      source: '46 CFR 11.315(a)(1)',
      totalDays: 720,
      caveat: 'At least 360 days of the 720 must be seagoing service as Chief Mate.',
    },
    {
      id: 'national-master-200',
      label: 'National Master under 200 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 200 GRT',
      source: '46 CFR 11.315(d) table 1',
      totalDays: 360,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // Table 1 to 46 CFR 11.317(d). Mate under 200 GRT needs 12 months, the same as the standard route.
  'uscg-stcw-master-under-500gt-nc': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '12 months as OICNW',
      source: '46 CFR 11.317(a)(1)',
    },
    {
      id: 'national-master-200',
      label: 'National Master under 200 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 200 GRT',
      source: '46 CFR 11.317(d) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // 46 CFR 11.319(a)(1) and table 1 to 11.319(d).
  'uscg-stcw-oicnw-under-500gt': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months of deck service, including 6 months of bridge watchkeeping',
      source: '46 CFR 11.319(a)(1)(i)',
    },
    {
      id: 'training-programme',
      label: 'Approved training programme',
      summary: 'Cadets on an approved programme with onboard training meeting Section A-II/1',
      source: '46 CFR 11.319(a)(1)(ii)',
      totalDays: 360,
      caveat:
        'Only seagoing service within the approved programme counts. The 6 months of supervised bridge watchkeeping still applies.',
    },
    {
      id: 'national-master-200',
      label: 'National Master under 200 GRT',
      summary: 'Holders of Master (oceans or near-coastal) under 200 GRT',
      source: '46 CFR 11.319(d) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
    {
      id: 'national-mate-200',
      label: 'National Mate under 200 GRT',
      summary: 'Holders of Mate (oceans or near-coastal) under 200 GRT',
      source: '46 CFR 11.319(d) table 1',
      totalDays: 360,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // 46 CFR 11.321(a)(1) and table 1 to 11.321(d). The (a)(1)(ii) programme route gives no day figure.
  'uscg-stcw-oicnw-under-500gt-nc': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '24 months of seagoing deck service',
      source: '46 CFR 11.321(a)(1)(i)',
    },
    {
      id: 'approved-training',
      label: 'Approved training route',
      summary: 'Seafarers who have completed the approved training for this endorsement',
      source: '46 CFR 11.321(a)(1)(iii)',
      totalDays: 360,
      caveat: 'The approved training for 46 CFR 11.321 must be completed as well as the seagoing service.',
    },
    {
      id: 'national-mate-200',
      label: 'National Mate under 200 GRT',
      summary: 'Holders of Mate (oceans or near-coastal) under 200 GRT',
      source: '46 CFR 11.321(d) table 1',
      totalDays: 180,
      caveat: 'Sea service must be under the authority of that national endorsement.',
    },
  ],

  // ── National engineer ────────────────────────────────────────────

  // 46 CFR 11.516(a). Academy graduation and the Apprentice Engineer programme have no day figure.
  'uscg-third-assistant-engineer': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years in the engine room, including 2 years as QMED',
      source: '46 CFR 11.516(a)(1)',
    },
    {
      id: 'machinist',
      label: 'Machinist apprenticeship',
      summary: 'Seafarers who served 3 years as an apprentice machinist on marine, locomotive or stationary engines',
      source: '46 CFR 11.516(a)(2)',
      totalDays: 360,
      caveat:
        'The 3-year apprenticeship is ashore and is not tracked. The 360 days must be in the engine room as Oiler, Boiler Technician, Watertender or Junior Engineer.',
    },
    {
      id: 'abet-marine',
      label: 'Marine engineering degree',
      summary: 'Graduates of an ABET accredited marine engineering course',
      source: '46 CFR 11.516(a)(4)',
      totalDays: 90,
      caveat: 'Service must be in the engine department of steam, motor or gas turbine propelled vessels.',
    },
    {
      id: 'abet-mech-elec',
      label: 'Mechanical or electrical degree',
      summary: 'Graduates of an ABET accredited mechanical or electrical engineering course',
      source: '46 CFR 11.516(a)(5)',
      totalDays: 180,
      caveat: 'Service must be in the engine department of steam, motor or gas turbine propelled vessels.',
    },
    {
      id: 'ae-limited',
      label: 'Assistant Engineer-Limited',
      summary: 'Holders of Assistant Engineer-Limited',
      source: '46 CFR 11.516(a)(7)',
      totalDays: 360,
      caveat: 'All of it as Assistant Engineer-Limited of self-propelled vessels. An examination is required.',
    },
  ],

  // ── Offshore supply vessels ──────────────────────────────────────

  // 46 CFR 11.555(a) to (c): one certificate in the app covers all three power levels.
  'uscg-assistant-engineer-osv': [
    {
      id: 'standard',
      label: 'Unlimited propulsion power',
      summary: '3 years in the engine room, including 18 months as QMED',
      source: '46 CFR 11.555(a)(1)',
    },
    {
      id: 'training-programme',
      label: 'Approved training programme',
      summary: 'Cadets on an approved or accepted Assistant Engineer-OSV training programme',
      source: '46 CFR 11.555(a)(2)',
      totalDays: 360,
      caveat: 'Only service as part of the approved or accepted programme counts.',
    },
    {
      id: 'under-4000hp',
      label: 'Under 4,000 HP / 3,000 kW',
      summary: 'For an endorsement limited to less than 4,000 HP / 3,000 kW',
      source: '46 CFR 11.555(b)',
      totalDays: 720,
      caveat: 'At least 360 days must be as QMED or an equivalent position.',
    },
    {
      id: 'under-1000hp',
      label: 'Under 1,000 HP / 750 kW',
      summary: 'For an endorsement limited to less than 1,000 HP / 750 kW',
      source: '46 CFR 11.555(c)',
      totalDays: 360,
      caveat: 'At least 180 days must be as QMED or an equivalent position.',
    },
  ],

  // ── Mobile offshore drilling units ───────────────────────────────

  // 46 CFR 11.542(a)(1)(i) and (ii).
  'uscg-chief-engineer-modu': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '6 years assigned to MODUs, including 3 years in an engineering or supervisory capacity',
      source: '46 CFR 11.542(a)(1)(i)',
    },
    {
      id: 'ae-modu',
      label: 'Assistant Engineer-MODU route',
      summary: 'Seafarers serving as Assistant Engineer-MODU',
      source: '46 CFR 11.542(a)(1)(ii)',
      totalDays: 720,
      caveat:
        'All of it as Assistant Engineer-MODU, with at least 360 days on self-propelled or propulsion assisted units.',
    },
  ],

  // 46 CFR 11.544(a)(1)(i) to (iii).
  'uscg-assistant-engineer-modu': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '3 years assigned to MODUs, including 18 months in an engineering or supervisory capacity',
      source: '46 CFR 11.544(a)(1)(i)',
    },
    {
      id: 'machinist',
      label: 'Diesel machinist route',
      summary: 'Seafarers with 3 years in the machinist trade building or repairing diesel engines',
      source: '46 CFR 11.544(a)(1)(ii)',
      totalDays: 360,
      caveat:
        'The machinist years are ashore and are not tracked. The 360 days must be on MODUs as Mechanic, Motorman, Oiler or equivalent, with 270 days on self-propelled or propulsion assisted units.',
    },
    {
      id: 'degree',
      label: 'Engineering technology degree',
      summary: 'Holders of an ABET accredited marine, mechanical or electrical engineering technology degree',
      source: '46 CFR 11.544(a)(1)(iii)',
      totalDays: 180,
      caveat:
        'All of it in an engineering or supervisory capacity aboard self-propelled or propulsion assisted units.',
    },
  ],

  // ── STCW engineer ────────────────────────────────────────────────

  // 46 CFR 11.325(a)(1) and table 1 to 11.325(d). Chief Engineer-MODU (12 or 24 months) is left out.
  'uscg-stcw-chief-engineer-3000kw': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months as OICEW on ships of 750 kW / 1,000 HP or more',
      source: '46 CFR 11.325(a)(1)',
    },
    {
      id: 'second-engineer',
      label: 'With 12 months as Second Engineer',
      summary: 'Officers who have served at least 12 months as Second Engineer Officer on 3,000 kW / 4,000 HP or more',
      source: '46 CFR 11.325(a)(1)',
      totalDays: 720,
      caveat:
        'At least 360 days of the 720 must be as Second Engineer Officer on ships of 3,000 kW / 4,000 HP or more.',
    },
    {
      id: 'national-ce-limited',
      label: 'Chief Engineer-Limited',
      summary: 'Holders of a national Chief Engineer-Limited endorsement',
      source: '46 CFR 11.325(d) table 1',
      totalDays: 360,
      caveat: 'Additional sea service after gaining that national endorsement.',
    },
    {
      id: 'national-dde',
      label: 'Designated Duty Engineer',
      summary: 'Holders of a national DDE endorsement of any horsepower',
      source: '46 CFR 11.325(d) table 1',
      totalDays: 720,
      caveat: 'All of it as DDE. The STCW endorsement should be limited to vessels under 500 GRT.',
    },
  ],

  // 46 CFR 11.329(a)(1) and table 1 to 11.329(e).
  'uscg-stcw-oicew': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months of seagoing service in the engine department',
      source: '46 CFR 11.329(a)(1)(i)',
    },
    {
      id: 'training-programme',
      label: 'Approved training programme',
      summary: 'Cadets on an approved programme of workshop training and seagoing service meeting Section A-III/1',
      source: '46 CFR 11.329(a)(1)(ii)',
      totalDays: 360,
      caveat:
        'Workshop training is not tracked; 360 days is the minimum seagoing service within the programme. The 6 months of supervised engine room watchkeeping still applies.',
    },
    {
      id: 'national-dde-4000hp',
      label: 'DDE under 4,000 HP / 3,000 kW',
      summary: 'Holders of a national DDE endorsement under 4,000 HP / 3,000 kW',
      source: '46 CFR 11.329(e) table 1',
      totalDays: 360,
      caveat:
        'Additional sea service after gaining that national endorsement. The STCW endorsement should be limited to vessels under 500 GRT.',
    },
    {
      id: 'national-dde-1000hp',
      label: 'DDE under 1,000 HP / 750 kW',
      summary: 'Holders of a national DDE endorsement under 1,000 HP / 750 kW',
      source: '46 CFR 11.329(e) table 1',
      totalDays: 720,
      caveat:
        'Additional sea service after gaining that national endorsement. The STCW endorsement should be limited to vessels under 500 GRT.',
    },
  ],

  // Table 1 to 46 CFR 11.331(e). DDE 750 kW / 1,000 HP needs 24 months, the same as the standard route.
  'uscg-stcw-chief-engineer-750-3000kw': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '24 months on seagoing vessels of 750 kW / 1,000 HP or more, 12 of them qualified as Second Engineer',
      source: '46 CFR 11.331(a)(1)',
    },
    {
      id: 'national-ce-modu',
      label: 'Chief Engineer-MODU',
      summary: 'Holders of a national Chief Engineer-MODU endorsement',
      source: '46 CFR 11.331(e) table 1',
      totalDays: 360,
      caveat: 'Additional sea service after gaining that national endorsement.',
    },
    {
      id: 'national-dde-4000hp',
      label: 'DDE 3,000 kW / 4,000 HP',
      summary: 'Holders of a national DDE endorsement of 3,000 kW / 4,000 HP',
      source: '46 CFR 11.331(e) table 1',
      totalDays: 360,
      caveat:
        'Additional sea service after gaining that national endorsement. The STCW endorsement should be limited to vessels under 500 GRT.',
    },
  ],

  // 46 CFR 11.335(a)(1) and (b).
  'uscg-stcw-eto': [
    {
      id: 'standard',
      label: 'Standard route',
      summary: '36 months of combined workshop training and seagoing service',
      source: '46 CFR 11.335(a)(1)',
    },
    {
      id: 'training-programme',
      label: 'Approved training programme',
      summary: 'Cadets on an approved programme of workshop training and seagoing service meeting Section A-III/6',
      source: '46 CFR 11.335(a)(1)',
      totalDays: 360,
      caveat: 'Workshop training is not tracked; 360 days is the minimum seagoing service within the programme.',
    },
    {
      id: 'experienced',
      label: 'Experienced electrical rating',
      summary: 'Seafarers who have served in a relevant electrical capacity on board',
      source: '46 CFR 11.335(b)',
      totalDays: 360,
      caveat:
        'The service must fall within the 60 months before applying, in a relevant capacity, and the Section A-III/6 standard of competence must be shown.',
    },
  ],
};
