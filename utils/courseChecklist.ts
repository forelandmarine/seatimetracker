import type { Certificate } from '@/utils/certificatesApi';
import {
  COURSE_CATALOG,
  CHECKLISTS,
  LEGACY_CERT_TYPES,
  ADD_AS_TYPE,
  EXTRA_COURSE_LABELS,
  type ChecklistItem,
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
}

const SOON_DAYS = 90;

/** Certificate type a new record for this course is saved under. */
export function certificateTypeFor(code: string): string {
  return ADD_AS_TYPE[code] ?? `course_${code}`;
}

/** Every certificate type that counts as holding this course. */
export function typesSatisfying(code: string): string[] {
  return Array.from(new Set([`course_${code}`, ...(LEGACY_CERT_TYPES[code] ?? [])]));
}

export function courseLabel(code: string): string {
  return COURSE_CATALOG[code]?.label ?? EXTRA_COURSE_LABELS[code] ?? code.replace(/_/g, ' ');
}

const YEARS: Record<string, number> = { '5y_update': 5, '3y': 3, '1y': 1, '2y': 2 };

function addYears(iso: string, years: number): string {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
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

export function evaluateItem(item: ChecklistItem, certificates: Certificate[], now = new Date()): ItemState {
  const codes = [item.code, ...(item.alternatives ?? [])];
  const types = new Set(codes.flatMap(typesSatisfying));
  const matches = certificates.filter((c) => types.has(c.certificate_type));
  if (matches.length === 0) return { item, status: 'todo', certificate: null, validUntil: null };

  // Prefer the record that is valid for longest; undated records come last.
  const ranked = matches
    .map((c) => ({ c, until: validUntilFor(c, item.validity) }))
    .sort((a, b) => (b.until ?? '').localeCompare(a.until ?? ''));
  const best = ranked[0];

  if (!needsDate(item.validity) || item.type === 'manual' || item.type === 'prerequisite_coc') {
    return { item, status: 'done', certificate: best.c, validUntil: best.until };
  }
  if (!best.until) return { item, status: 'done_no_date', certificate: best.c, validUntil: null };

  const days = Math.ceil((new Date(best.until).getTime() - now.getTime()) / 86_400_000);
  const status: ItemStatus = days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'done';
  return { item, status, certificate: best.c, validUntil: best.until };
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
