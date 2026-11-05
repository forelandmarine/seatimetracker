/**
 * Per-entry signatures: the Master or a responsible person signs one sea time
 * entry, on the seafarer's phone or from a one-time link. MGN 496 5.3 applies as
 * for the testimonial: where the seafarer served as Master, a responsible person
 * signs.
 *
 * A signature covers what the signer saw: the vessel, the start and end times and
 * the service type. Those are kept as a fingerprint with the signature, and a
 * signature whose fingerprint no longer matches the entry does not count. Edits
 * through PUT /api/sea-time/:id also clear it outright.
 */

import { annexCCapacity } from './workboatTestimonial.js';

export type SignerCapacity = 'master' | 'responsible_person';
export type SignatureMethod = 'in_person' | 'link';

export const ENTRY_SIGNATURE_LIMIT = 300_000;
const NAME_LIMIT = 200;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Statuses an entry can be signed in: finished passages and shifts. */
export const SIGNABLE_STATUSES = ['pending', 'confirmed'];

export const CAPACITY_LABELS: Record<SignerCapacity, string> = {
  master: 'Master',
  responsible_person: 'Responsible person',
};

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  actual_sea_service: 'Sea service',
  watchkeeping_service: 'Watchkeeping',
  standby_service: 'Stand-by',
  yard_service: 'Yard',
  service_in_port: 'In port',
};

interface FingerprintFields {
  vessel_id: string;
  start_time: Date | string;
  end_time: Date | string | null;
  service_type: string | null;
}

const iso = (d: Date | string | null) => (d == null ? '' : new Date(d).toISOString());

/** What a signature covers: vessel, start, end and service type. */
export function signatureFingerprint(e: FingerprintFields): string {
  return [e.vessel_id, iso(e.start_time), iso(e.end_time), e.service_type || 'actual_sea_service'].join('|');
}

export interface SignedEntryFields extends FingerprintFields {
  signature_image?: string | null;
  signature_signer_name?: string | null;
  signature_signer_capacity?: string | null;
  signature_signed_at?: Date | string | null;
  signature_method?: string | null;
  signature_fingerprint?: string | null;
}

/** True when the entry carries a signature that still matches it. */
export function signatureIsCurrent(e: SignedEntryFields): boolean {
  return typeof e.signature_image === 'string'
    && e.signature_image.startsWith('data:image/png;base64,')
    && !!e.signature_signed_at
    && e.signature_fingerprint === signatureFingerprint(e);
}

/** The columns to null to remove a signature. */
export const SIGNATURE_CLEARED = {
  signature_image: null,
  signature_signer_name: null,
  signature_signer_capacity: null,
  signature_signed_at: null,
  signature_method: null,
  signature_fingerprint: null,
} as const;

/** Whether an update to the entry changes anything the signature covers. */
export function changesSignedFields(current: FingerprintFields, update: Partial<FingerprintFields>): boolean {
  return signatureFingerprint(current) !== signatureFingerprint({ ...current, ...update });
}

/**
 * Entries with a signature that no longer matches (or never had the signer's
 * details) have it removed, so the testimonial only embeds signatures that count.
 */
export function withCurrentSignatures<T extends SignedEntryFields>(entries: T[]): T[] {
  return entries.map((e) => (e.signature_image && !signatureIsCurrent(e) ? { ...e, ...SIGNATURE_CLEARED } : e));
}

/** The signature as the app shows it, or null when there is none or it no longer matches. */
export function entrySignatureView(e: SignedEntryFields) {
  if (!signatureIsCurrent(e)) return null;
  return {
    signer_name: e.signature_signer_name ?? '',
    signer_capacity: (e.signature_signer_capacity ?? 'master') as SignerCapacity,
    signed_at: iso(e.signature_signed_at!),
    method: (e.signature_method ?? 'in_person') as SignatureMethod,
  };
}

/** Why an entry cannot be signed yet, or null when it can. */
export function cannotSignReason(e: { status: string; end_time: Date | string | null }): string | null {
  if (!e.end_time) return 'This entry has not finished yet. It can be signed once it has an end time.';
  if (!SIGNABLE_STATUSES.includes(e.status)) return 'Only pending or confirmed entries can be signed.';
  return null;
}

/** MGN 496 5.3: an entry served as Master is signed by a responsible person. */
export const servedAsMaster = (rank: string | null | undefined) => annexCCapacity(rank) === 'Master';

export interface EntrySignatureInput {
  signer_name: string;
  signer_capacity: SignerCapacity;
  signature_image: string;
}

/**
 * Checks a submitted entry signature. Returns the cleaned fields, or the first
 * problem as a sentence for the signer.
 */
export function validateEntrySignature(
  body: any,
  opts: { served_as_master: boolean },
): { ok: true; value: EntrySignatureInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Nothing was submitted.' };
  if (body.confirm !== true) return { ok: false, error: 'Please confirm the entry before signing.' };
  const signer_name = typeof body.signer_name === 'string' ? body.signer_name.trim().slice(0, NAME_LIMIT) : '';
  if (!signer_name) return { ok: false, error: 'Please print the name of the person signing.' };
  const cap = body.signer_capacity;
  if (cap !== 'master' && cap !== 'responsible_person') {
    return { ok: false, error: 'Please say whether the signer is the Master or a responsible person.' };
  }
  if (opts.served_as_master && cap === 'master') {
    return {
      ok: false,
      error: 'The seafarer served as Master on this entry, so MGN 496 5.3 needs the owner or a responsible person from the management company to sign.',
    };
  }
  const sig = body.signature_image;
  if (typeof sig !== 'string' || sig.length > ENTRY_SIGNATURE_LIMIT || !PNG_DATA_URL.test(sig)) {
    return { ok: false, error: 'Please sign in the box.' };
  }
  return { ok: true, value: { signer_name, signer_capacity: cap, signature_image: sig } };
}

/** The columns written when an entry is signed. */
export function signatureColumns(
  entry: FingerprintFields,
  input: EntrySignatureInput,
  method: SignatureMethod,
  at: Date = new Date(),
) {
  return {
    signature_image: input.signature_image,
    signature_signer_name: input.signer_name,
    signature_signer_capacity: input.signer_capacity,
    signature_signed_at: at,
    signature_method: method,
    signature_fingerprint: signatureFingerprint(entry),
  };
}

/** What the signer is shown on the link page, frozen when the link is made. */
export interface EntrySnapshot {
  seafarer_name: string;
  vessel_name: string;
  start_time: string;
  end_time: string;
  hours: number;
  service_type: string;
  capacity: string | null;
  from_port: string | null;
  to_port: string | null;
  served_as_master: boolean;
}

export function entrySnapshot(
  e: FingerprintFields & { rank?: string | null; from_port?: string | null; to_port?: string | null },
  vesselName: string,
  seafarerName: string,
): EntrySnapshot {
  const start = new Date(e.start_time);
  const end = new Date(e.end_time!);
  return {
    seafarer_name: seafarerName,
    vessel_name: vesselName,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    hours: Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 10) / 10,
    service_type: SERVICE_TYPE_LABELS[e.service_type || 'actual_sea_service'] ?? 'Sea service',
    capacity: annexCCapacity(e.rank) ?? null,
    from_port: e.from_port ?? null,
    to_port: e.to_port ?? null,
    served_as_master: servedAsMaster(e.rank),
  };
}
