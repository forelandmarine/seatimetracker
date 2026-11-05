/**
 * What the issuing rules tie to a high-speed craft (vessels.is_high_speed, the
 * vessel screen's High-speed craft switch). Only these are built:
 *
 * 1. Workboat Code Edition 3, Annex 5, Table A5.1, Note F:
 *    "Where the vessel is used in accordance with 26.1.5 (Towing) or 25.4 (High
 *    Speed and Planing Mode Operations), the Master must have a minimum of an
 *    RYA/MCA Advanced Powerboat Certificate and suitable experience of relevant
 *    operation. For high-speed operations, this qualification shall be done in a
 *    high-speed vessel."
 *    So a master of a high-speed workboat needs the Advanced Powerboat
 *    certificate, taken in a high-speed vessel, whatever the area category. Note 1
 *    lets the Administration consider qualifications "of equal standing or
 *    specialist application", so the app says "needed" but not "the only one".
 *
 * 2. MSN 1853 Annex 5 Table C, Fast Craft Operations: deck service on a fast
 *    craft counts toward the BML fast craft endorsement. Counted in
 *    boatmasterEndorsements.ts.
 *
 * Not built, because the flag cannot tell: MSN 1868 8.4 ("Masters and officers
 * having an operational role on HSC and the HS-OSC must hold a Type Rating
 * Certificate as required by the HSC and the HS-OSC Code") applies only to
 * craft certified under the HSC Code, which a planing workboat usually is not.
 * The app names it on the switch and lets the type rating be recorded.
 */

/** Certificate types that count as holding the RYA/MCA Advanced Powerboat Certificate. */
export const ADVANCED_POWERBOAT_TYPES = ['course_powerboat_advanced'];

export interface HighSpeedVessel {
  id: string;
  vessel_name?: string | null;
  is_high_speed?: boolean | null;
  is_workboat?: boolean | null;
  is_tug?: boolean | null;
  sector?: string | null;
}

export interface HighSpeedEntry {
  vessel_id: string | null;
  rank?: string | null;
  status?: string | null;
}

export interface HighSpeedCertificate {
  certificate_type: string;
  expiry_date?: string | Date | null;
}

export interface HighSpeedNeed {
  /** The certificate needed, as a certificate type the app can add. */
  certificate_type: 'course_powerboat_advanced';
  /** Where the rule comes from. */
  rule: 'wbc3_table_a5_1_note_f';
  /** High-speed workboats this applies to. */
  vessels: { id: string; name: string }[];
  /** The user has logged confirmed service as master on one of them. */
  served_as_master: boolean;
  /** A valid Advanced Powerboat certificate is on file. */
  held: boolean;
}

/** Commercial work under the Workboat Code: workboat, tug or commercial vessel, or a commercial-sector user. */
function workboatCodeVessel(v: HighSpeedVessel, userSector: string | null | undefined): boolean {
  return v.is_workboat === true || v.is_tug === true || v.sector === 'commercial' || userSector === 'commercial';
}

const today = (now: Date) => now.toISOString().slice(0, 10);
const dateOf = (d: string | Date) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

/**
 * The WBC3 Note F need for this user, or null when none of their vessels is a
 * high-speed workboat. Yachts are left out: the Sport or Pleasure Vessel Code
 * (2025) has a similar Note F for 25.7 High Speed and Planing Mode Operations,
 * but the app does not track that code.
 */
export function highSpeedNeeds(
  vessels: HighSpeedVessel[],
  entries: HighSpeedEntry[],
  certs: HighSpeedCertificate[],
  userSector: string | null = null,
  now: Date = new Date(),
): HighSpeedNeed | null {
  const fast = vessels.filter((v) => v.is_high_speed === true && workboatCodeVessel(v, userSector));
  if (fast.length === 0) return null;
  const ids = new Set(fast.map((v) => v.id));
  const servedAsMaster = entries.some(
    (e) => e.vessel_id != null && ids.has(e.vessel_id) && e.rank === 'master' && (e.status == null || e.status === 'confirmed'),
  );
  const held = certs.some(
    (c) => ADVANCED_POWERBOAT_TYPES.includes(c.certificate_type) && (!c.expiry_date || dateOf(c.expiry_date) >= today(now)),
  );
  return {
    certificate_type: 'course_powerboat_advanced',
    rule: 'wbc3_table_a5_1_note_f',
    vessels: fast.map((v) => ({ id: v.id, name: v.vessel_name || 'Unnamed vessel' })),
    served_as_master: servedAsMaster,
    held,
  };
}
