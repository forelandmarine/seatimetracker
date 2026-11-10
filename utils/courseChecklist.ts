import type { Certificate } from '@/utils/certificatesApi';
import { daysUntil } from '@/utils/localDate';
import {
  COURSE_CATALOG,
  CHECKLISTS,
  LEGACY_CERT_TYPES,
  ADD_AS_TYPE,
  EXTRA_COURSE_LABELS,
  type ChecklistItem,
  type ChecklistItemType,
  type Validity,
} from '@/constants/courseChecklists';

/**
 * "Before your oral" checklist: works out, for the user's target CoC, which
 * required courses are held, which have expired or are about to, and which are
 * still to take. Certificates the user already added are matched by type.
 */

export type ItemStatus = 'done' | 'done_no_date' | 'soon' | 'expired' | 'todo';

export interface ItemState {
  item: ChecklistItem;
  status: ItemStatus;
  certificate: Certificate | null;
  /** ISO date the course stops counting, if known. */
  validUntil: string | null;
  /** Ticked, but the number or a needed date is still missing. */
  missingDetails: boolean;
}

const SOON_DAYS = 90;

/**
 * Certificate types that count for a checklist code but that the generated
 * checklists don't know about. The MCA asks for "an ENG1 (or equivalent)" for a
 * UK CoC and accepts the STCW seafarer medicals of the MSN 1815 countries instead.
 */
const ACCEPTED_INSTEAD: Record<string, string[]> = {
  eng1: ['accepted_seafarer_medical'],
};

/** Certificate type a new record for this course is saved under. */
export function certificateTypeFor(code: string): string {
  return ADD_AS_TYPE[code] ?? `course_${code}`;
}

/** Every certificate type that counts as holding this course. */
export function typesSatisfying(code: string): string[] {
  return Array.from(new Set([`course_${code}`, ...(LEGACY_CERT_TYPES[code] ?? []), ...(ACCEPTED_INSTEAD[code] ?? [])]));
}

export function courseLabel(code: string): string {
  return COURSE_CATALOG[code]?.label ?? EXTRA_COURSE_LABELS[code] ?? code.replace(/_/g, ' ');
}

const YEARS: Record<string, number> = { '5y_update': 5, '5y': 5, '3y': 3, '1y': 1, '2y': 2 };

// Date-only arithmetic, so the result doesn't move with the phone's time zone.
// 29 Feb plus a non-leap number of years lands on 28 Feb.
function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const year = y + years;
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function validUntilFor(cert: Certificate, validity: Validity): string | null {
  if (cert.expiry_date) return cert.expiry_date;
  const years = YEARS[validity];
  if (years && cert.issued_date) return addYears(cert.issued_date, years);
  return null;
}

// "other: ..." rules are explained in the item note rather than tracked.
function needsDate(validity: Validity): boolean {
  return validity !== 'none' && !validity.startsWith('other');
}

/**
 * A held course still needs details when it has no certificate number, or no
 * issue or expiry date for a course that expires. Manual items (record books,
 * sign-offs) have no number, so they never need details.
 */
export function certificateMissingDetails(cert: Certificate, validity: Validity, itemType?: ChecklistItemType): boolean {
  if (itemType === 'manual') return false;
  if (!cert.certificate_number?.trim()) return true;
  if (itemType === 'prerequisite_coc') return false;
  return needsDate(validity) && !cert.issued_date && !cert.expiry_date;
}

/** True when the record holds nothing but its type, so unticking can delete it quietly. */
export function isEmptyCertificate(cert: Certificate): boolean {
  return !cert.certificate_number?.trim() && !cert.issuing_body?.trim() && !cert.issued_date && !cert.expiry_date;
}

/** The course a certificate type stands for, if any. */
export function courseCodeForType(type: string): string | null {
  if (type.startsWith('course_')) return type.slice('course_'.length);
  const added = Object.keys(ADD_AS_TYPE).find((code) => ADD_AS_TYPE[code] === type);
  if (added) return added;
  return (
    Object.keys(LEGACY_CERT_TYPES).find((code) => LEGACY_CERT_TYPES[code].includes(type)) ??
    Object.keys(ACCEPTED_INSTEAD).find((code) => ACCEPTED_INSTEAD[code].includes(type)) ??
    null
  );
}

/** Codes that are only ever a tick (record books, sign-offs, sights taken at sea). */
const MANUAL_CODES = new Set(
  Object.values(CHECKLISTS).flatMap((list) => list.items.filter((i) => i.type === 'manual').map((i) => i.code)),
);

/** Course certificates that still need a number or a date (the Home reminder). */
export function certificatesNeedingDetails(certificates: Certificate[]): Certificate[] {
  return certificates.filter((c) => {
    const code = courseCodeForType(c.certificate_type);
    if (!code || MANUAL_CODES.has(code)) return false;
    return certificateMissingDetails(c, COURSE_CATALOG[code]?.validity ?? 'none');
  });
}

export function evaluateItem(item: ChecklistItem, certificates: Certificate[], now = new Date()): ItemState {
  const codes = [item.code, ...(item.alternatives ?? [])];
  const types = new Set(codes.flatMap(typesSatisfying));
  const matches = certificates.filter((c) => types.has(c.certificate_type));
  if (matches.length === 0) return { item, status: 'todo', certificate: null, validUntil: null, missingDetails: false };

  // Prefer the record that is valid for longest; undated records come last.
  const ranked = matches
    .map((c) => ({ c, until: validUntilFor(c, item.validity) }))
    .sort((a, b) => (b.until ?? '').localeCompare(a.until ?? ''));
  const best = ranked[0];
  const missingDetails = certificateMissingDetails(best.c, item.validity, item.type);

  if (!needsDate(item.validity) || item.type === 'manual' || item.type === 'prerequisite_coc') {
    return { item, status: 'done', certificate: best.c, validUntil: best.until, missingDetails };
  }
  if (!best.until) return { item, status: 'done_no_date', certificate: best.c, validUntil: null, missingDetails };

  const days = daysUntil(best.until.slice(0, 10), now);
  const status: ItemStatus = days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'done';
  return { item, status, certificate: best.c, validUntil: best.until, missingDetails };
}

export interface ChecklistResult {
  exam: string;
  states: ItemState[];
  /** Optional items: they don't block the CoC but missing them limits it. */
  recommended: ItemState[];
  examNote?: string;
  /** Courses still to take plus expired ones. Sea service is tracked separately. */
  toGo: number;
  done: number;
  total: number;
  seaService: ChecklistItem[];
  sources: string[];
}

export function evaluateChecklist(pathwayId: string, certificates: Certificate[]): ChecklistResult | null {
  const list = CHECKLISTS[pathwayId];
  if (!list) return null;
  const seaService = list.items.filter((i) => i.type === 'sea_service');
  const states = list.items
    .filter((i) => i.type !== 'sea_service' && !i.optional)
    .map((i) => evaluateItem(i, certificates));
  const recommended = list.items.filter((i) => i.type !== 'sea_service' && i.optional).map((i) => evaluateItem(i, certificates));
  const toGo = states.filter((s) => s.status === 'todo' || s.status === 'expired').length;
  return {
    exam: list.exam,
    examNote: list.examNote,
    states,
    recommended,
    toGo,
    done: states.length - toGo,
    total: states.length,
    seaService,
    sources: list.sources,
  };
}

export function hasChecklist(pathwayId: string | null | undefined): boolean {
  return !!pathwayId && !!CHECKLISTS[pathwayId];
}
