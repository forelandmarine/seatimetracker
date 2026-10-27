# SAMSA pathway spec (South Africa) for SeaTime Tracker

Research date: 26 October 2026. Every rule below is taken from a SAMSA-published document (regulations hosted on samsa.org.za, Marine Notices, SAMSA training standards and SAMSA application forms). Third-party pages were only used to find documents. Anything not confirmed from SAMSA's own text is in the UNCONFIRMED section and is kept out of `samsa_pathways.json`.

Companion files in this folder:
- `samsa_pathways.json`: 47 certificates in the app's shape (maps to `MCARequirement`: `seaServiceDays` to `totalDays`, `watchkeepingDays` to `watchkeepingDays`, `seaServiceHours` to `totalHours`).
- `samsa_sources.json`: 45 SAMSA documents with type and licence note.

## 1. The most important finding: the 2013 Regulations are repealed

The brief named the Merchant Shipping (Training and Certification) Regulations 2013. That instrument (properly "Safe Manning, Training and Certification Regulations, 2013", GN R.511 of 23 July 2013) was **repealed** by the **Merchant Shipping (Training, Certification and Safe Manning) Regulations, 2021** (Department of Transport Notice 219 of 2021, Government Gazette 44469, 23 April 2021), which came into operation on publication [R21 reg 124(1), reg 126, p 117-118]. All rules below are from the 2021 Regulations ("TCSM Regs 2021"). Regulation numbers changed: for example the old reg 81 (calculating service) is now reg 10(7), and the old reg 33 (non-trading limitation) is now reg 22.

Marine Notice 20 of 2016 is still SAMSA's main policy notice on assessing sea service, but it was written against the 2013 Regulations and quotes their old numbering.

## 2. Source key

| Key | Document | URL |
|---|---|---|
| R21 | TCSM Regs 2021 (GN 219 of 2021, GG 44469). Page refs are "Page X of 156" | https://www.samsa.org.za/api/api/File/view/VqnrY3ztihPJISnF4Jep6A%3D%3D |
| R13 | 2013 Regulations (repealed, historical) | https://www.samsa.org.za/api/api/File/view/egxym7QUGN5gAtkna58Opg%3D%3D |
| NSVS | MS (National Small Vessel Safety) Regulations 2007 as amended | https://www.samsa.org.za/api/api/File/view/vyLp3fF8J9NRaX4BylmhNQ%3D%3D |
| MN13 | Marine Notice 13 of 2011 (small vessel interpretation, skipper certification) | https://www.samsa.org.za/api/api/File/view/60JutNB3ki%2Fsy6awZwDV2g%3D%3D |
| MN20 | Marine Notice 20 of 2016 (assessment of CoC applications) | https://www.samsa.org.za/api/api/File/view/RwPvAob%2BhmTb3aQY34q6IQ%3D%3D |
| MN12 | Marine Notice 12 of 2018 (port operations / shift work sea service) | https://www.samsa.org.za/api/api/File/view/qB5zo5iABdU%2BwFPt8hgxcA%3D%3D |
| MN6 | Marine Notice 6 of 2014 (charter yachts 25 to 100 GT) | https://www.samsa.org.za/api/api/File/view/vCXW%2BMenI5%2Fm1SOjoeSeVA%3D%3D |
| MN15 | Marine Notice 15 of 2018 (foreign recreational vessels) | https://www.samsa.org.za/api/api/File/view/5%2BpoAZTYEtTABG4EZX2P8A%3D%3D |
| F-DU | QMS-OF-1005.0a L3A Deck Unlimited | https://www.samsa.org.za/api/api/File/view/d8nPJ9%2BvKzUqh%2BxTTWYWUA%3D%3D |
| F-D500 | QMS-OF-1005.0e L3A Deck <500 GT | https://www.samsa.org.za/api/api/File/view/7nHKu8g12uu69blaDQfHJw%3D%3D |
| F-EU | QMS-OF-1005.0b L3A Engine Unlimited | https://www.samsa.org.za/api/api/File/view/bQZYOA5xx0jMmRR8fN2IEQ%3D%3D |
| F-DP | QMS-OF-1005.0g L3A Deck Port Ops | https://www.samsa.org.za/api/api/File/view/rNhCoGODLVc0tYSqVQkSUA%3D%3D |
| F-EP | QMS-OF-1005.0h L3A Engine Port Ops | https://www.samsa.org.za/api/api/File/view/6TI8d0yAo%2F1FcVXVCkBHjw%3D%3D |
| F-COP | QMS-OF-1006.0a Issue of a CoP (deck ratings, cook) | https://www.samsa.org.za/api/api/File/view/B7yzaR77stNKjvl4TWocIQ%3D%3D |
| F-COPE | QMS-OF-1006.1b Revalidation of a CoP (engine ratings) | https://www.samsa.org.za/api/api/File/view/CMrlTRy9AqLEkzkLzleulg%3D%3D |
| F-RDU | QMS-OF-1007.0.a Revalidation Deck Unlimited | https://www.samsa.org.za/api/api/File/view/GvJtTWo1IiYitKXZ70Arlg%3D%3D |
| F-RSV | QMS-OF-1007.0.e Revalidation Deck Small Vessels | https://www.samsa.org.za/api/api/File/view/wyqAugPEcH3R4NuF9GkT5A%3D%3D |
| F-REU | QMS-OF-1007.0.b Revalidation Engine Unlimited | https://www.samsa.org.za/api/api/File/view/HC0FaHvTwZ0RWzHa33BI5Q%3D%3D |
| STA-102 | STA-06-102 Fire prevention and fire fighting | https://www.samsa.org.za/api/api/File/view/Cz8U4vW3AMT3tsGp5314Pw%3D%3D |
| STA-101 | STA-06-101 Personal survival techniques | https://www.samsa.org.za/api/api/File/view/I3nDDqad5BfWbN9vTuWLkg%3D%3D |
| STA-201a | STA-06-201a PSCRB refresher | https://www.samsa.org.za/api/api/File/view/SCQOVtoTyMqzZbPuYvD52Q%3D%3D |
| STA-402a | STA-06-402a Medical care refresher | https://www.samsa.org.za/api/api/File/view/LPEiJyHzPN9IzyXjlAcvTQ%3D%3D |
| STA-GOCa | STA-04-101a GMDSS GOC refresher | https://www.samsa.org.za/api/api/File/view/Of9mKiWkNwRQSVfsfe%2FTIg%3D%3D |
| MIN10 | MIN 10-25 Recognition of foreign CoCs | https://www.samsa.org.za/api/api/File/view/AYe2XNXleiNnYV14XCdZAQ%3D%3D |
| A3 | Annex 3 accredited courses (16 Oct 2026) | https://www.samsa.org.za/api/api/File/view/1mFGj%2BVR3XnFF1YtRlodUQ%3D%3D |

How the URLs work: samsa.org.za is a single-page app. Its document list comes from `https://www.samsa.org.za/api/api/File/all` and each link is `/api/api/File/view/<id encrypted client-side>`. The links above were generated with the same method the site uses (checked: the POPIA disclaimer link generated this way matches the link in the site footer). The application forms are XFA PDFs that show "requires Adobe Reader" in most viewers; the course matrices were read from the XFA template data.

## 3. How SAMSA counts sea service (counting rules)

| Rule | Detail | Source |
|---|---|---|
| A day | Qualifying service runs from date of engagement to date of discharge, counting actual calendar days, **both days inclusive**. There is no hours-per-day threshold for seagoing service: every signed-on day counts | R21 reg 10(7), p 34 |
| Month and year | **30 days = 1 month, 12 months = 1 year.** All month figures in the JSON are multiplied by 30 | R21 reg 10(7), p 34 |
| Port operations day | A shift of **at least 8 hours in a 24-hour period = 1 day**; more than 8 hours in a day still counts as 1 day, and extra hours do not carry over | R21 reg 10(9), p 34-35; MN12 p 1-2 |
| Watchkeeping | Deck: watchkeeping certificates must show at least **8 hours watchkeeping in every 24 hours** claimed. Engineering: 8 in 24, or **24 hours on duty in every 72** on ships with a periodically unmanned engine room | R21 reg 11(5), 11(7), p 35 |
| Watchkeeping evidence window | MN 20 says the watchkeeping testimonial covers the last six months of sea service and watchkeeping time must be at least a third of the sea service claimed from any ship | MN20 Annex 2 para 9, p 14-15 |
| Standby (construction or refit) | Time standing by a ship under construction or refit **counts in full but may not exceed one-third** of the required qualifying service (one-quarter on accelerated training) | R21 reg 12(2), p 36 |
| Ships not regularly proceeding to sea | Counts in full if time actually at sea is at least **two-thirds** of the period on board; otherwise **1.5 x days actually at sea** | R21 reg 12(1), p 36; worked example MN20 Appendix 6, p 24-27 |
| Departure day | A departure where preparations start before midnight counts as a full day on the preparation date (example 22:00 prep, 01:00 departure) | MN20 Appendix 6 step 3, p 26 |
| Mining / exploration vessels | Mining-limited CoC: full. Otherwise one-third of time on board, or 1.5 x days navigating if mining was under two-thirds of the time | R21 reg 12(3), p 36 |
| 10-year window | Qualifying service must have been performed within **10 years** before the application | R21 reg 11(4), p 35 |
| Near coastal | Near-coastal voyage = within the SA EEZ (200 nm). Service in a foreign country's near-coastal limits counts only towards near-coastal certificates; voyages under 150 nm are treated as near-coastal | R21 reg 1 p 12, reg 11(9) p 36 |
| Foreign-flag service | Counts unless SAMSA cannot verify it | R21 reg 11(10), p 36 |
| Proof | Certificates of discharge or a completed Seafarer's Record Book; gaps must be explained in writing | R21 reg 11(1), 11(3), p 35 |
| Simulator | Shore-based simulator training can replace up to a quarter of the sea service inside an approved programme (OOW, OOW <500 GT NC, EOOW only) | R21 reg 13, p 36-37 |
| Penalty | Misrepresented service: disqualified until the deficiency plus 12 extra months is served | R21 reg 17, p 38 |
| Small vessel certificates | Counted in **logged hours**, with separate night-hour minimums and overnight passages for the higher grades (not days) | MN13 s 10.5, p 35-44 |

### Vessel-type thresholds and the yacht problem

- "Trading ship" excludes "ships used solely for sport or recreation" [R21 reg 1, p 15]. Almost every officer and AB certificate requires service on **trading ships** of a given GT or kW.
- If more than half of a candidate's qualifying service is on vessels not engaged in trading, the CoC is **limited to non-trading vessels** [R21 reg 22(2), p 41].
- MN 20 of 2016 para 3.3: "Super yachts and other Sport or Recreation vessels": sea service on these counts **in full for a certificate of competency endorsed Non-Trading**. For an unlimited (trading) CoC the case goes to the Senior Examiner, case by case, with a cover letter, a breakdown of days steaming / at anchor / alongside / dry dock, watchkeeping certificates and an activity breakdown [MN20 Annex 2 para 3.3, p 6].
- MN 20 policy statement 2: where service could fall under trading or non-trading, "the final test shall be whether the ship is used for commercial gain"; if so it is accepted as trading [MN20 para 3.2, p 6]. MN 20 also defines "non-trading vessels" as pleasure vessels or commercial vessels under 3 000 GT carrying not more than 12 passengers with no cargo operations [MN20 p 5].
- The SAMSA L3A deck forms list **"Super Yachts"** as a ship type and "Non-Trading" as a type of operation in the sea service table [F-DU, F-D500 section D].
- Suggested app behaviour: for SAMSA deck officer pathways, count private yacht time but flag the certificate as "Non-Trading endorsement likely", and show charter (commercial gain) time separately. This maps onto the app's existing `commercialService` split.

GT and kW thresholds by certificate are in the table in section 4.

## 4. Certificates covered (47)

All officer CoCs require Level 3 assessment (oral by a SAMSA examiner) after Level 1 (onboard) and Level 2 (accredited institution) [R21 reg 18, 20, p 38-40]. "Approved education and training ... Training Standards Code" applies to every CoC. Every CoC and rating CoP is revalidated every 5 years: 12 months service in the last 5 years, or 3 months in rank in the last 6 months, or approved refresher training, or equivalent functions [R21 reg 3(1)-(3), p 27-28]. Medical certificate valid max 2 years (1 year under 18); visual acuity test 2 years; colour vision 6 years [R21 reg 86, p 88].

### Deck, seagoing (Division 1)

| Certificate | Reg | Sea service | Vessel | Age | Source |
|---|---|---|---|---|---|
| Master | 24 | 36 months as OOW, or 24 months incl. 12 as chief mate | Trading, 1 600 GT+, unlimited | - | R21 p 41 |
| Chief Mate | 25 | 12 months as OOW | Trading, 1 600 GT+, unlimited | - | R21 p 41-42 |
| Master (<3 000 GT) | 26 | 36 months as OOW, or 24 incl. 12 as chief mate | Trading, 500 GT+, unlimited | - | R21 p 42 |
| Chief Mate (<3 000 GT) | 27 | 12 months as OOW | Trading, 500 GT+, unlimited | - | R21 p 42 |
| OOW (unlimited) | 28 | 36 months deck dept (12 on accelerated programme), incl. 6 months supervised bridge watchkeeping, record book | Trading, 500 GT+, unlimited | 18 | R21 p 42-43 |
| Master (<500 GT NC) | 29 | 12 months as OOW, holding OOW (<500 GT NC) | Trading, 100 GT+, any seagoing | 20 | R21 p 43 |
| OOW (<500 GT NC) | 30 | 36 months deck dept (12 accelerated, on 500 GT+ unlimited), 6 months bridge watchkeeping | Trading, 100 GT+, any seagoing | 18 | R21 p 43-44 |
| Master (<200 GT NC) | 31 | 12 months as OOW | Trading, 25 GT+, any seagoing | 20 | R21 p 44 |

### Deck, port operations (Division 2). Port operations area = 15 nm from the outer breakwater light [R21 reg 1, p 12]

| Certificate | Reg | Service | Age | Source |
|---|---|---|---|---|
| Master (Port Operations) | 32 | 6 months as OOW/master on port ops vessels 1 000 GT+ (from Master <1 600 GT PO), or 12 months as OOW on 1 600 GT+ (from Skipper <200 GT PO) | 20 | R21 p 45 |
| Master (<1 600 GT Port Operations) | 33 | 12 months port ops service under a master, on 100 GT+, while holding Skipper (<200 GT PO) | 20 | R21 p 45-46 |
| Skipper (<200 GT Port Operations) | 34 | 12 months deck dept on 25 GT+ seagoing, fishing, port ops or naval (14 m+) ships; **9 months if holding Coastal Skipper ≥9 m or Skipper Offshore ≥9 m**; 6 months supervised bridge watchkeeping | 18 | R21 p 46-47 |

### Radio (Division 4)

GMDSS GOC (reg 43, age 18, revalidated 5-yearly), Long Range Certificate and Short Range Certificate (reg 44, age 16, no revalidation) [R21 p 54-55; reg 3(3)(a) p 28].

### Engineering (Divisions 5 and 6)

| Certificate | Reg | Sea service | Vessel | Age | Source |
|---|---|---|---|---|---|
| Chief Engineer Officer | 47 | 36 months as EOOW, or 12 months as 2/E | Trading, 3 000 kW+ | - (form says 18) | R21 p 57; F-EU |
| Second Engineer Officer | 48 | 12 months as EOOW (6 if holding 2/E <3 000 kW) | Trading, 3 000 kW+ | - | R21 p 57-58 |
| Chief Engineer (<3 000 kW) | 49 | 36 months as EOOW, or 12 as 2/E | Trading, 750 kW+ | - | R21 p 58 |
| Second Engineer (<3 000 kW) | 50 | 12 months as EOOW | Trading, 750 kW | - | R21 p 58-59 |
| EOOW (unlimited) | 51 | 36 months engine dept (12 accelerated), 6 months supervised watchkeeping, record book, workshop course | Trading, 750 kW+ | 18 | R21 p 59-60; reg 11(8) p 35 |
| Electro-technical Officer | 52 | 36 months engine room (12 accelerated), record book, theory exam | Over 750 kW | 18 | R21 p 60 |
| Chief Engineer (Port Ops) | 53 | 12 months as EOOW on 750 kW+ incl. 3 on 1 500 kW+ (from CE <1 500 kW PO); 18 incl. 6 (from CE <750 kW PO); none stated from 2/E <3 000 kW | Port ops or sea | - | R21 p 60-61 |
| Chief Engineer (<1 500 kW Port Ops) | 54 | 18 months port ops in engine dept on 750 kW+ (accelerated, record book); or 12 months as EOOW if holding CE <750 kW PO | 750 kW+ | 18 | R21 p 61-62 |
| Chief Engineer (<750 kW Port Ops) | 55 | 18 months on 100 kW+, supervised; 12 if holding EOOW (PO) or an approved trade certificate | 100 kW+ | - | R21 p 62 |
| EOOW (Port Ops) | 56 | 18 months port ops in engine dept, supervised, accelerated programme with record book | 100 kW+ | 18 | R21 p 62-63 |
| Chief Engineer (<750 kW) | 57 | 12 months (from EOOW <750 kW) or 6 months (from CE <750 kW PO) | 350 kW+ | - | R21 p 63 |
| EOOW (<750 kW) | 58 | 18 months, or 12 if holding 2/E (PO) or an approved trade certificate | 100 kW+ | 18 | R21 p 63-64 |

Regs 57 and 58 say "approved sea service on ships of N kW", not "trading ships", and are the nearest SAMSA equivalent to the MCA small vessel engineer ladder for yacht engineers.

### Ratings (Division 8)

| Certificate | Reg | Service | Vessel | Age | Source |
|---|---|---|---|---|---|
| Ordinary Seafarer Deck | 66 | 6 months (2 accelerated), steering certificate, record book, provisional OS from master | 25 GT+, **any voyages** (not limited to trading) | 16 | R21 p 69-70 |
| Able Seafarer Deck | 63 | 18 months (12 accelerated) holding OS | Trading, 100 GT+, unlimited or NC | 18 | R21 p 66-67 |
| OS Deck (Port Ops) | 68 | 6 months (2 accelerated) | 25 GT+ in port ops | 16 | R21 p 70-71 |
| AB Deck (Port Ops) | 65 | 12 months port ops (6 accelerated) holding OS | 25 GT+ | 18 | R21 p 68-69 |
| Ordinary Seafarer Engine | 72 | 6 months (2 accelerated), provisional OS from chief engineer | Trading, 750 kW+ | 16 | R21 p 73-74 |
| Able Seafarer Engine | 70 | 12 months (6 accelerated) holding OS Engine | Trading, 750 kW+ | 18 | R21 p 72 |
| OS Engine (Port Ops) | 73 | 6 months (2 accelerated) | Trading, 100 kW+ | 16 | R21 p 74 |
| AB Engine (Port Ops) | 71 | 12 months port ops (6 accelerated) | 100 kW+ | 18 | R21 p 72-73 |
| Electro-technical Rating | 74 | Seagoing service incl. at least 12 months training and experience | 750 kW+ | 18 | R21 p 74-75 |
| General Purpose Rating (Port Ops) | 75 | 18 months (6 deck, 6 engine, 6 either) holding OS Deck and OS Engine; 6 months if holding an AB | 25 GT+ | 18 | R21 p 75 |
| Ship's Cook | 69 | 3 months catering dept | Trading 100 GT+, or fishing vessels requiring a cook | 18 | R21 p 71-72 |

### Small vessel skipper certificates (National Small Vessel Safety regime)

There is **no SAMSA yacht CoC** (no equivalent of MCA OOW/Master Yachts). Recreational and small commercial skippers are certificated under the NSVS Regulations 2007, with SAMSA's requirements in Marine Notice 13 of 2011. Commercial certificate holders must be 18+, pleasure 16+ [NSVS reg 16(1)]. Commercial vessels of any size and pleasure vessels that are sailing vessels of 9 m+ or power-driven over 15 hp need a certificated skipper [NSVS reg 14(1)]. Areas: Category A any distance, B under 40 nm, C under 15 nm, E within 1 nm of shore and 15 nm of a launch site, R inland [MN13 s 10.2.3, p 30].

Logged hours (three routes each: approved training institution + hours / tutored hours / untutored hours) [MN13 s 10.5, p 35-44]:

| Certificate | Training route | Tutored | Untutored / other | Night | Entry |
|---|---|---|---|---|---|
| Skipper Inland (Restricted) | - | 50 h | - | - | 16, any doctor's cert |
| Skipper Inland | 25 h | 50 h | 100 h | - | 16 |
| Day Skipper Local Waters (Restricted) | - | 50 h | 100 h | - | 16 |
| Day Skipper Cat E | 25 h | 50 h | 100 h | - | 16 |
| Day Skipper Cat C | 25 h | 50 h | 100 h | - | 16 |
| Day Skipper Cat B | 50 h (Cat C+ vessels) | 100 h | 200 h | - | 16, eyesight test |
| Coastal Skipper <9 m | 150 h (training or Day Skipper B/C) | 200 h | 300 h | 50 h | 16, eyesight test |
| Skipper Offshore <9 m | 250 h | 500 h | Coastal <9 m + 100 h; Day Skipper B + 300 h | 50 h, 3 overnight passages | 18, liferaft 1 day, FF 1 day, EFA, restricted R/T |
| Coastal Skipper ≥9 m | 250 h on >9 m | 350 h | Day Skipper B >9 m + 150 h; Coastal/Offshore <9 m + 100 h | 50 h | Commercial: 18, SAMSA medical + eyesight, liferafts, first aid at sea, 2-day FF, R/T, SAMSA oral. Pleasure: 16, First Aid L1, 1-day liferaft, 1-day FF, R/T |
| Skipper Offshore ≥9 m | 500 h (training or Day Skipper Local >9 m) | 1000 h | Coastal >9 m + 350 h | 50 h, 3 overnight passages | As Coastal ≥9 m |

Coastal Skipper ≥9 m covers commercial vessels under 25 GT and pleasure vessels under 100 GT within 40 nm; Skipper Offshore ≥9 m the same tonnages on any passage [MN13 s 10.3.2.6-10.3.2.7, p 32-33].

Endorsements (not in JSON as separate pathways) [MN13 s 10.4, 10.6, p 33-47]: Dive skipper (exempt with Dive Master or equivalent, otherwise basic dive qualification or 10 h on dive vessels plus 70% written exam); Passenger vessel (more than 12 passengers, restricted or unrestricted, SAMSA oral plus practical, age 18); Commercial night operation (Day Skipper Local Waters plus 150 h logged after issue incl. 48 night, SAMSA oral); Sailing (SA Sailing or CASA holders entitled; otherwise SAMSA/SA Sailing exam); Surf launching (12 surf launches on 4 different days plus practical before an examiner).

Charter yachts 25 to 100 GT (sport and recreation charter, max 12 passengers) are exempted from the merchant regime if they meet MN 6 of 2014; manning: Coastal Skipper Commercial ≥9 m (under 40 nm) or Skipper Offshore Commercial ≥9 m (any distance), plus a mate (Coastal Skipper <9 m) on voyages of 14 hours or more, and an STCW III/3 engineer or shore maintenance contract at 750 kW or more [MN6 p 3-4].

## 5. Courses and validity

Codes used are from COURSE_CODES.md; new codes are listed after the table. Per-certificate requirements were read from the "Supporting documents" matrix of each SAMSA application form (an "x" = required). Course lists in the JSON follow those forms exactly.

| Code | SAMSA course | Validity | Source |
|---|---|---|---|
| pst | Personal Survival Techniques STA-06-101 | 5y_update | R21 reg 3(3)(c) p 28. Note: STA-06-101 para 19 says accreditation of a "Refresher: Personal Survival Techniques" ceased 30 Sept 2018 [STA-101 p 13] |
| fpff | Fire Prevention and Fire Fighting STA-06-102 | 5y_update | R21 reg 3(3)(c); STA-102 para 5 "provide evidence every 5 years by re-attending this course" |
| efa | Elementary First Aid | none | R21 reg 3(3)(c) exempts reg 2(9)(a)(iii) |
| pssr | Personal Safety and Social Responsibilities | none | R21 reg 3(3)(c) exempts reg 2(9)(a)(iv) |
| mfa | Medical First Aid | 5y_update | R21 reg 3(3)(c) (not in the exempt list) |
| medical_care | Medical Care | 5y_update | R21 reg 3(3)(c); refresher allowed if previous course not expired by more than 3 months [STA-402a para 5] |
| aff | Advanced Fire Fighting | 5y_update | R21 reg 3(3)(c); refresher STA-06-301a; AFF/MC holders need not hold FPFF/MFA [MN20 Annex 2 para 4, p 10] |
| pscrb | Survival Craft and Rescue Boats (other than FRB) | 5y_update | R21 reg 3(3)(c); refresher entry needs a certificate within 7 years and 12 months sea service in last 5 years [STA-201a para 4] |
| frb | Fast Rescue Boats | 5y_update in reg 3(3)(c), but MN 20 allows revalidation by continued competence | R21 reg 3(3)(c); MN20 Annex 2 para 4.7 |
| sso, dsd, psa | Ship Security Officer / Designated Security Duties / Security Awareness | none | R21 reg 3(3)(c) exempts reg 2(9)(i), (j), (k) |
| gmdss_goc | GMDSS GOC | 5y_update | R21 reg 3(3)(a); refresher STA-04-101a |
| lrc, src | Long / Short Range Certificate | none | R21 reg 3(3)(a) excludes reg 2(4)(d) |
| ecdis | ECDIS generic | none (continued competence) | MN20 Annex 2 para 4.7, p 11 |
| ship_cook | Ship's Cook | rating CoP 5y | R21 reg 69, reg 3(3)(b) |

Security policy: DSD is the minimum for STCW II/1, II/5, III/1, III/2, III/3, III/5, III/6; SSO is required for II/2 officers (master and chief mate) [MN20 Annex 2 para 2, p 4].

Holders serving on fishing vessels need not revalidate PST and FPFF [R21 reg 3(3)(c)].

NEW CODES (add to COURSE_CODES.md):
- `samsa_ens_op`: SAMSA Electronic Navigation Systems (Operational), incl. simulator (radar/ARPA/ECDIS-type module on F-DU, F-D500, F-DP)
- `samsa_ens_mgmt`: SAMSA Electronic Navigation Systems (Management), incl. simulator
- `samsa_ens_non_stcw`: Electronic Navigation Systems (Non STCW), for Skipper <200 GT Port Ops
- `samsa_comms_1`: SAMSA "Communications 1" academic/radio module listed on deck L3A forms
- `samsa_able_seafarer_deck`: Able Seafarer Deck course completion certificate (STA-03-101b), required on several officer forms
- `samsa_able_seafarer_engine`: Able Seafarer Engine course completion (STA-03-102b)
- `high_voltage`: High Voltage course, required for all engineer officer CoCs on F-EU
- `samsa_workshop_skills`: approved practical workshop skills training (first engineer certificate, reg 11(8)(b))
- `samsa_academic_results`: certificate of results for the academic subjects from an accredited institution
- `samsa_trb`: approved training record book (manual, not a course)
- `samsa_medical`: SAMSA seafarer medical certificate (2 years; 1 year under 18)
- `samsa_eyesight`: SAMSA eyesight certificate (visual acuity 2 years, colour vision 6 years)
- `samsa_steering_cert`: steering certificate from onboard training (OS Deck)
- `sv_liferaft`: small vessel liferaft course (1 day) / Proficiency in Liferafts
- `sv_firefighting_1day`, `sv_firefighting_2day`: small vessel fire fighting
- `sv_first_aid`: First Aid Level 1 (pleasure) or First Aid at Sea (commercial)
- `sv_rt_restricted`: restricted R/T certificate (being replaced by SRC, reg 125(5))
- `sv_doctors_cert`: doctor's certificate for small vessel certificates

## 6. AI knowledge library candidates and licence position

- The SAMSA site footer reads "@ 2025 SAMSA. All rights Reserved". No open licence, terms of use or reuse statement for documents was found; the only site policy document is a POPIA (privacy) disclaimer. So, unlike Maritime NZ, there is **no licence grant at all**, either permissive or restrictive.
- South Africa's Copyright Act 98 of 1978, s 12(8)(a), says no copyright subsists in "official texts of a legislative, administrative or legal nature". This clearly covers the Regulations (Government Gazette texts, which the gazette also states are "available free online"). It very likely covers Marine Notices and training standards as official administrative texts, but that is a legal reading, not a SAMSA permission. (The s 12(8)(a) wording was confirmed via secondary reproductions; the Act itself is at lawlibrary.org.za.)
- Recommendation: ingest without hesitation: R21, NSVS. Ingest for internal retrieval with attribution (do not republish verbatim): MN 13 of 2011, MN 20 of 2016, MN 12 of 2018, MN 6 of 2014, MN 15 of 2018, the STA training standards, Annex 3 course list. Use the XFA forms only as data for course matrices. Full list with notes in `samsa_sources.json`.

## 7. UNCONFIRMED (kept out of the main data)

1. **Amendments to the 2021 Regulations.** A draft "Training, Certification and Safe Manning Amendment Regulations, 2024" was published for comment as GN R.4041 (GG 49618, 10 Nov 2023) according to search results; I could not read it or confirm it was ever made final. SAMSA's regulations list (File/all index) hosts the 2013 and 2021 texts but no amendment regulations.
2. **Whether MN 13 of 2011 hour figures are still current.** It is still listed on SAMSA's marine notices page and the 2021 Regulations still refer to Coastal Skipper ≥9 m and Skipper Offshore ≥9 m, but I found no later notice either confirming or replacing the hours.
3. **Small vessel certificate validity or revalidation.** No validity period for small vessel skipper certificates or their courses (liferaft, fire fighting, first aid) was found in NSVS or MN 13. Interim certificates are valid 6 months [MN13 s 10.2.2]. A SAMSA blog post (2022) said revalidation under the 2021 Regulations excluded "fishing and boating certificates"; not used.
4. **Dry-dock / refit cap conflict.** R21 reg 12(2) caps standby at one-third of required service; MN 20 of 2016 (written under the 2013 Regulations) says dry-dock time counts in full up to 6 months. The JSON and counting rules use the regulation.
5. **OOW (<200 GT near-coastal).** Reg 31 requires holding "OOW (<200 GT near-coastal or unlimited)" but reg 2(2) lists no such certificate, and F-D500 shows a trainee bridge watchkeeping route for Master <200 GT NC. Whether a direct-entry route exists is unconfirmed.
6. **Age conflicts between forms and regulations.** F-D500 gives 18 for Master <200 GT NC (reg 31 says 20); F-COP gives 18 for OS Deck Port Ops (reg 68 says 16); F-EU gives 18 only for Chief Engineer. Regulations used.
7. **PST revalidation route.** Reg 3(3)(c) requires 5-yearly revalidation of PST, but STA-06-101 says the PST refresher accreditation ceased in 2018. How PST is now revalidated (full course, sea service, or combined basic training refresher) is unconfirmed. Annex 3 lists "Advanced Fire Fighting - Refresher (including Fire Prevention and Fire Fighting - Refresher)".
8. **Yacht service towards ratings (AB Deck, AB Engine) and towards an unlimited officer CoC.** MN 20 only covers officer CoCs (Non-Trading endorsement in full; unlimited case by case). No SAMSA rule found for ratings.
9. **Course lists not on any form**: EOOW (Port Ops), Chief Engineer <750 kW, EOOW <750 kW, OS Engine (Port Ops). Only medical/eyesight are listed for these in the JSON. The engine ratings issue form (QMS-OF-1006.0b) could not be parsed, so engine rating course lists come from the revalidation form QMS-OF-1006.1b.
10. **ENS level on F-D500.** The <500 GT form says "Electronic Navigation Systems" without a level; mapped to `samsa_ens_op`.
11. **MIN 10-25** (recognition of foreign CoCs, UK recognised both ways) shows expiry 31 July 2026 "unless withdrawn"; no replacement was found in the index.

## 8. Not covered (out of audience)

Fishing deck and engineer certificates (regs 35-42, 59-62), Able/Ordinary Seafarer (Fishing) (regs 64, 67), special grade certificates (regs 23, 46, issued on training only), steam endorsement (reg 45), tanker, IGF, polar and passenger ship endorsements (regs 76-80). All are in R21 if needed later.
