# MCA "Before your oral" checklists: notes

Data file: `mca_course_checklists.json` (23 MCA pathway ids, every non-USCG id in `constants/mcaRequirements.ts`; there are no merchant pathways in that file yet).

Sources are given as `file#section`. Paths are relative to `backend/knowledge/mca/`. Only two items use a non-MCA source: the RYA commercial endorsement items on the two Yachtmaster pathways (`providers/workboat-and-commercial-endorsement-notes.md`, our paraphrase of the RYA page and form).

## Schema notes

Two optional fields were added on top of the agreed shape:

- `exam_note` (per pathway): NOE and oral pass validity, and what is needed before the NOE versus before CoC issue.
- `optional: true` (per item): the item is not needed for the CoC, but without it the CoC carries a limitation or it is only needed for MCA use later (ECDIS on Master Code Vessels and workboats, High Voltage for SV engineers, Yachtmaster shore-based courses and endorsement items on the RYA pathways). The app should show these as "recommended", not as blockers.

`exam` values as used:

- `written+oral`: the route includes MCA-set written or online exams (yacht module exams, SV competency exams, Yacht Unlimited assessments, Master Code Part A online test) before or alongside the MCA oral.
- `oral`: only an oral at the end (Master Yachts Unlimited, MEOL SV, ETO). The two Yachtmaster pathways are marked `oral` for the RYA practical/oral exam.
- `none`: no exam (Yacht Rating, NWR, Able Seafarer Deck, Chief Mate Yachts <3000 GT). EDH is `none` because its exam is part of the approved course.

Timing: for the deck and workboat CoCs most courses are needed before CoC issue, not before the oral (MSN 1858 11.3, MSF 4257 section 4). Things needed before the NOE are flagged in each item's `note` (basic training for a first UK CoC, the OOW TRB, Master <3000 GT module passes when no Master <500 GT CoC is held, SV engineer AEC, workshop and TRB).

## NEW CODES

Prerequisite CoCs (type `prerequisite_coc`):
- `coc_oow_yachts_3000` OOW (Yachts) <3000 GT CoC
- `coc_master_code_200` Master (Code Vessels) <200 GT CoC
- `coc_master_yachts_500` Master (Yachts) <500 GT CoC
- `coc_master_yachts_3000` Master (Yachts) <3000 GT CoC
- `coc_cm_yachts_unlimited` Chief Mate (Yachts) Unlimited CoC
- `coc_oow_unlimited` OOW Unlimited (merchant) CoC
- `coc_fishing_class1` UK Class 1 Fishing CoC
- `coc_nwr` Navigational Watch Rating CoP
- `coc_yacht_rating` Yacht Rating CoP
- `coc_bml_t1l2` Boatmasters' Licence Tier 1 Level 2
- `coc_tug_rating` Tug Rating CoP
- `coc_eoow_sv` SV Engineer Officer of the Watch CoC
- `coc_ce_sv_500` SV Chief Engineer <3000 kW <500 GT CoC

Yacht deck:
- `iyt_master_yachts_limited` IYT Master of Yachts Limited (alternative to Yachtmaster Offshore + shore-based)
- `iyt_master_yachts_unlimited` IYT Master of Yachts Unlimited (alternative to Yachtmaster Ocean + shore-based)
- `iyt_master_yachts_coastal` IYT Master of Yachts Coastal / Mate <200 GT
- `watch_leader` Watch Leader certificate (with Competent Crew, Yacht Rating reduced route)
- `mca_part_a_master_code` MCA Part A online proctored exam for Master (Code Vessels) <200 GT / OOW (Yachts) <500 GT, pass valid 1 year
- `rya_ppr` RYA Professional Practices and Responsibilities online course (commercial endorsement)
- `rya_basic_sea_survival` RYA Basic Sea Survival (alternative to PST for the commercial endorsement)
- `ml5` ML5 medical (MSF 4112), alternative to ENG1 for RYA commercial endorsement

Yachts Unlimited academic modules and assessments (MSN 1858 4.3):
- `yu_applied_met` Applied Marine Meteorology
- `yu_passage_planning` Management Level Passage Planning
- `yu_bridge_ops` Management of Bridge Operations
- `yu_yacht_ops` Management of Yacht Operations
- `yu_marine_eng_systems` Marine Engineering Systems
- `yu_structures_maintenance` Marine Vessels: Structures and Maintenance
- `yu_ship_stability` Ship Stability: Theory and Practical Application
- `yu_shipboard_mgmt` Shipboard Management
- `yu_law_business` Shipmaster's Law and Business
- `yu_cm_nav_assessment` MCA Chief Mate Navigation assessment (Yacht Unlimited)
- `yu_cm_stability_assessment` MCA Chief Mate Stability assessment (Yacht Unlimited)
- `mgmt_level_qualification` MCA approved management-level qualification (Honours Degree, FD, Scottish Professional Diploma, DipHE, HND, Advanced Diploma) that exempts the nine modules

Ratings and record books (type `manual`):
- `yacht_rating_trb` Yacht Rating Training Record Book (MSN 1862 Annex B)
- `nwr_trb` NWR Training Record Book (MSN 1862 Annex A)
- `steering_cert` Steering certificate (MSN 1862 Annex F)
- `workboat_trb` Workboat Training Record Book (MGN 496)
- `sv_eng_trb` Small Vessel engineer Training Record Book (MSN 1904)
- `eto_trb` ETO Training Record Book (MSN 1860)

Small vessel engineering (MSN 1904):
- `sv_eng_marine_diesel` Marine Diesel Engineering module and exam
- `sv_eng_aux_equip_1` Auxiliary Equipment Part I module and exam
- `sv_eng_ops_hotel_construction` Operational Procedures, Basic Hotel Services and Ship Construction module and exam
- `sv_eng_ce_statutory_ops` Chief Engineer Statutory and Operational Requirements module and exam
- `sv_eng_aux_equip_2` Auxiliary Equipment Part II module and exam
- `sv_eng_applied_marine_eng` Applied Marine Engineering module and exam
- `sv_eng_ges_1_2` General Engineering Science I and II (no expiry)
- `sv_eng_dip_ms_sv` Diploma in Maritime Studies: Small Vessel Engineer
- `sv_eng_dip_ms_sv_ce` Diploma in Maritime Studies: Small Vessel Chief Engineer
- `sv_eng_workshop_initial` 2 weeks initial Workshop Skills Training
- `sv_eng_workshop_additional` 2 weeks additional Workshop Skills Training
- `hv_op` High Voltage (Operational), A-III/1
- `hv_mgmt` High Voltage (Management), A-III/2 (also used for ETO)

ETO (MSN 1860):
- `eto_fd_hnd` MCA approved ETO Foundation Degree / HND or action-plan modules
- `eto_workshop_skills` ETO workshop skills training
- `eto_gmdss_radio_maint` GMDSS Radio Maintenance
- `eto_enem` Electronic Navigation Equipment Maintenance

Other:
- `pssr_vh_module` OneOcean "Prevention and Response to Violence and Harassment" module 0900 (MGN 718), needed by holders of a PSSR dated before 1 January 2026, deadline 31 March 2027
- `first_aid_at_sea` First Aid at Sea certificate (MSF 4257 accepts it in place of Medical First Aid)
- Gate codes (not courses): `sea_service`, `sea_service_recent` (6 months within 5 years rule), `sea_service_merchant` (Able Seafarer Deck)

Existing code reused with a different meaning: `master_yachts_nav` is described in COURSE_CODES.md as "Advanced navigation / passage planning"; the actual module is "Navigation, Radar and ARPA Simulator (NARAS, Master Yachts)". Suggest renaming the description.

## Unconfirmed (left out, or kept with a flag)

1. **Yachtmaster Offshore and Ocean (RYA)**: the RYA exam entry rules are not in the library and gov.uk does not hold them. Left out: sea time, mileage and passage gates, the Ocean prerequisite (Offshore or OOW) and the ocean qualifying passage (these are only in the app's own constants), plus any first aid or SRC requirement to sit the exam. The checklists hold only the shore-based courses (optional) and the commercial endorsement items from our RYA notes. **These two pathways are incomplete**; an RYA source is needed to finish them.
2. **GMDSS GOC or ROC for Chief Mate and Master (Yachts) <3000 GT**: the MSN 1858 table ticks both GOC and ROC. For OOW the MSN table shows GOC only, but MSF 4343 accepts "GOC or ROC". Coded as GOC with ROC as an alternative; confirm with the MCA.
3. **Yachtmaster Ocean for Master (Yachts) <500 / <3000 GT**: included from the MSF 4343 checklist note. MSN 1858 3.5 and 3.6 do not list it.
4. **Restricted PSCRB (pscrb_otl) on Yachts Unlimited CoCs**: MSN 1858 6.6 allows it "for yacht CoCs"; not confirmed for the unlimited CoCs, so it is not offered there as an alternative.
5. **Validity of the Yacht Unlimited academic modules and the Chief Mate Navigation and Stability assessments**: not stated in MSN 1858 Amendment 2. Marked "other: validity not stated".
6. **HELM (Management) for ETO**: the MSN 1860 table extraction puts the single "Yes" under SETO, while 7.7 says HELM Management must be submitted "regardless of the education and training route". Left out of the ETO checklist; confirm.
7. **Yachtmaster Ocean commercial endorsement for workboat routes**: MSF 4257 asks for the RYA CoC to be commercially endorsed; MGN 496 does not. Kept in the label.
8. **ENG1 on SV Chief Engineer routes**: MSN 1904 4.9 and 4.10 do not list ENG1, but 11.3 says the ENG1 must be valid at CoC issue. Included, sourced to 11.3.
9. **Security Awareness (PSA)**: needed before joining a first ISPS ship (MSN 1858 1.5, MSN 1862 1.4, MSN 1904 1.5) but not listed for CoC issue except on the workboat Class 1 Fishing route. Left out elsewhere.

## Differences from the app's pathway notes (constants/mcaRequirements.ts)

- `master-workboat-500gt-from-fishing`: the app notes omit HELM (Management) and GMDSS GOC; MGN 496 11.5(d) lists both. Included.
- `master-workboat-500gt-from-oow-yachts`: GMDSS GOC is not in MGN 496 11.4 but MSF 4257 section 4A lists it for all applications. Included from MSF 4257.
- `chief-mate-yachts-unlimited`: the app note says Master (Yachts) <3000 GT and Chief Mate Unlimited holders are exempt "from this oral". MSN 1858 footnote 10 sits under 4.4 (Master Yachts Unlimited): those holders skip the Chief Mate Yacht Unlimited oral but must pass the Master Unlimited GT Yacht oral. Section 4.3(f) itself has no exemption. Worth re-wording in the app.
- `chief-mate-yachts-3000gt`: no oral in MSN 1858 3.4, so `exam` is `none`.

## Gaps not filled

- No WebFetch was needed for MCA rules: MSN 1865 Amendment 1 (validity) and MSN 1904 (current small vessel engineer MSN) are both on disk. MSN 1858 refers to "MSN 1865 (Amendment 2)", but only Amendment 1 is in the library and on gov.uk as far as the library shows.
- The ETO cadetship route is shown. The qualified-entrant (3.3) and rating (4.3) routes use the same items, with service set by the college action plan.
