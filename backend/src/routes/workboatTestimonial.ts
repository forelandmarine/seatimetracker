import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { entriesWithIdentity } from "../services/vesselIdentity.js";
import { entriesWithSoleWatch } from "../services/soleWatch.js";
import {
  ANNEX_C_CAPACITIES,
  annexCCapacity,
  buildWorkboatTestimonial,
  nilOr,
  type TestimonialEntry,
  type WorkboatTestimonial,
} from "../utils/workboatTestimonial.js";

/**
 * MGN 496 Annex C Deck (Workboat) Testimonial, one per vessel, as a PDF.
 *
 * Part 1 is filled from the user's confirmed service (utils/workboatTestimonial.ts).
 * Duties, Part 2 (conduct and ability) and Part 3 (signature, CoC number, stamp)
 * are left blank for the Master or the company to complete, because MGN 496 5.3
 * wants the testimonial signed by them, not by the seafarer. A service record
 * appendix lists every entry behind the figures, with the per-entry signature
 * where one was captured.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = fs.existsSync(path.join(__dirname, "..", "assets"))
  ? path.join(__dirname, "..", "assets")
  : path.join(__dirname, "assets");

const STEEL_BLUE = '#5386B6';
const DEEP_NAVY = '#040D1A';
const TEXT_BODY = '#4A5568';
const LIGHT_BG = '#F7F9FC';
const BORDER = '#E2E8F0';

const SERVICE_LABELS: Record<string, string> = {
  actual_sea_service: 'Sea service',
  watchkeeping_service: 'Watchkeeping',
  standby_service: 'Stand-by',
  service_in_port: 'In port',
};

const LEAVE_LABELS: Record<string, string> = {
  annual_leave: 'Annual leave',
  sick_leave: 'Sick leave',
  personal: 'Personal',
  training: 'Training',
  other: 'Other',
};

const ukDate = (d: string | Date | null | undefined): string => {
  if (!d) return '';
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return iso.split('-').reverse().join('/');
};

const hoursOf = (e: TestimonialEntry): number => {
  if (!e.end_time) return 0;
  return Math.max(0, (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3_600_000);
};

/** Vessel type as Annex C asks for it. */
function vesselType(v: { is_workboat?: boolean | null; is_tug?: boolean | null; is_passenger?: boolean | null; type?: string | null }): string {
  if (v.is_tug) return 'Tug';
  if (v.is_workboat) return 'Workboat';
  if (v.is_passenger) return 'Passenger vessel';
  return v.type || '';
}

export interface TestimonialBlock {
  vessel: any;
  t: WorkboatTestimonial;
}

/** Lays out the testimonials, one per block. The caller ends the document. */
export function testimonialPdf(
  blocks: TestimonialBlock[],
  seafarer: { name: string; dateOfBirth: string; dischargeBook: string },
  logger: { warn: (obj: object, msg: string) => void },
): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({ bufferPages: true, size: 'A4', margins: { top: 50, bottom: 70, left: 50, right: 50 } });
  const fontsDir = path.join(ASSETS_DIR, 'fonts');
  try {
    doc.registerFont('NunitoSans', path.join(fontsDir, 'NunitoSans-Regular.ttf'));
    doc.registerFont('NunitoSans-SemiBold', path.join(fontsDir, 'NunitoSans-SemiBold.ttf'));
    doc.registerFont('NunitoSans-Light', path.join(fontsDir, 'NunitoSans-Light.ttf'));
  } catch (err) {
    logger.warn({ err }, 'Failed to load Nunito Sans fonts, falling back to Helvetica');
    doc.registerFont('NunitoSans', 'Helvetica');
    doc.registerFont('NunitoSans-SemiBold', 'Helvetica-Bold');
    doc.registerFont('NunitoSans-Light', 'Helvetica');
  }

  const ML = 50;
  const PW = doc.page.width;
  const CW = PW - ML * 2;
  const PAGE_BOTTOM = doc.page.height - 70;
  const ensureSpace = (needed: number) => {
    if (doc.y + needed > PAGE_BOTTOM) doc.addPage();
  };

  const sectionLabel = (text: string) => {
    ensureSpace(30);
    doc.font('NunitoSans-SemiBold').fontSize(8).fillColor(STEEL_BLUE);
    doc.text(text.toUpperCase(), ML, doc.y, { characterSpacing: 1.5 });
    doc.y += 4;
  };

  /** Label on the left, value (or a dotted line to fill in) on the right. */
  const field = (label: string, value: string | null | undefined, labelW = 175) => {
    ensureSpace(20);
    const y = Math.round(doc.y);
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text(label, ML, y, { width: labelW });
    if (value) {
      doc.font('NunitoSans-SemiBold').fontSize(9.5).fillColor(DEEP_NAVY);
      doc.text(value, ML + labelW, y, { width: CW - labelW });
    } else {
      doc.strokeColor(BORDER).lineWidth(0.5).moveTo(ML + labelW, y + 11).lineTo(ML + CW, y + 11).stroke();
    }
    doc.y = Math.max(doc.y, y + 18);
  };

  const blankLines = (n: number) => {
    for (let i = 0; i < n; i++) {
      ensureSpace(18);
      const y = Math.round(doc.y) + 12;
      doc.strokeColor(BORDER).lineWidth(0.5).moveTo(ML, y).lineTo(ML + CW, y).stroke();
      doc.y = y + 6;
    }
  };

  const tickBox = (x: number, y: number, ticked: boolean) => {
    doc.strokeColor(DEEP_NAVY).lineWidth(0.6).rect(x, y, 9, 9).stroke();
    if (ticked) {
      doc.moveTo(x + 2, y + 2).lineTo(x + 7, y + 7).moveTo(x + 7, y + 2).lineTo(x + 2, y + 7).stroke();
    }
  };

  const note = (text: string) => {
    ensureSpace(24);
    doc.font('NunitoSans').fontSize(7.5).fillColor(TEXT_BODY);
    doc.text(text, ML, doc.y, { width: CW, lineGap: 1.5 });
    doc.y += 4;
  };

  const logoPath = path.join(ASSETS_DIR, 'brandmark-logo.png');
  const seafarerName = seafarer.name;
  const dob = seafarer.dateOfBirth;
  const dischargeBook = seafarer.dischargeBook;

  blocks.forEach(({ vessel, t }, index) => {
    if (index > 0) doc.addPage();

    // ── Header ─────────────────────────────────────────────
    try {
      if (fs.existsSync(logoPath)) doc.image(logoPath, ML, 38, { width: 110 });
    } catch (err) {
      logger.warn({ err }, 'Failed to load logo from disk');
    }
    doc.font('NunitoSans').fontSize(7.5).fillColor(TEXT_BODY);
    doc.text('MGN 496 Annex C format', 0, 45, { width: PW - ML, align: 'right' });
    doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(STEEL_BLUE);
    doc.text('DECK (WORKBOAT) TESTIMONIAL', ML, 78, { characterSpacing: 2.5 });
    doc.strokeColor(STEEL_BLUE).lineWidth(0.75).moveTo(ML, 94).lineTo(PW - ML, 94).stroke();
    doc.y = 104;

    sectionLabel('Company');
    field('Company name', null);
    field('Address', null);
    field('', null);
    field('Phone', null);
    field('Email', null);
    doc.y += 6;

    // ── Part 1 Service ─────────────────────────────────────
    sectionLabel('Part 1 Service');
    ensureSpace(36);
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text('This is to certify that in the capacity of:', ML, doc.y);
    const boxY = Math.round(doc.y) + 4;
    let bx = ML;
    for (const c of ANNEX_C_CAPACITIES) {
      tickBox(bx, boxY, t.capacities.includes(c));
      doc.font('NunitoSans').fontSize(9).fillColor(DEEP_NAVY);
      doc.text(c, bx + 13, boxY - 1);
      bx += 95;
    }
    doc.y = boxY + 18;
    if (t.capacity_unrecorded) {
      note('Some service was logged without a rank. The signatory should tick the capacity held.');
    }
    field('Full name', seafarerName);
    field('Date of birth', dob);
    field('Discharge book or national ID', dischargeBook);

    doc.y += 4;
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text('Has served in the vessel / workboat:', ML, doc.y);
    doc.y += 4;
    field('Name', vessel.vessel_name);
    field('Length (m)', vessel.length_metres ? String(Number(vessel.length_metres)) : null);
    field('Gross tons (gt)', vessel.gross_tonnes ? String(Number(vessel.gross_tonnes)) : null);
    field('Official number', vessel.official_number || vessel.imo_number || null);
    field('Vessel type', vesselType(vessel) || null);
    field('From', ukDate(t.from));
    field('To', ukDate(t.to));

    doc.y += 4;
    ensureSpace(60);
    const months = t.sea_service_months;
    const rem = t.sea_service_remaining_days;
    const seaText = t.sea_service_days
      ? `${months} months ${Number.isInteger(rem) ? rem : rem.toFixed(1)} days`
      : 'NIL';
    field('The above service includes', `${seaText} sea service`);
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text(
      'During the sea service the officer was in full charge of a navigational watch for not less than four out of every 24 hours whilst the vessel was engaged on voyage, giving:',
      ML, doc.y, { width: CW, lineGap: 1.5 },
    );
    doc.y += 4;
    field('Watchkeeping service of', nilOr(t.watchkeeping_days, 'days'));

    doc.y += 2;
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text('Duties and tasks carried out were:', ML, doc.y);
    blankLines(3);

    doc.y += 4;
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text('Leave of absence was granted as follows:', ML, doc.y);
    doc.y += 2;
    if (t.leave.length === 0) {
      doc.font('NunitoSans-SemiBold').fontSize(9.5).fillColor(DEEP_NAVY).text('NIL', ML, doc.y);
    } else {
      for (const l of t.leave) {
        ensureSpace(16);
        doc.font('NunitoSans-SemiBold').fontSize(9.5).fillColor(DEEP_NAVY);
        doc.text(`${ukDate(l.start_date)} to ${ukDate(l.end_date)}${l.reason ? `, ${LEAVE_LABELS[l.reason] ?? l.reason}` : ''}`, ML, doc.y);
      }
    }
    doc.y += 8;

    // ── Part 2 Testimonial ─────────────────────────────────
    doc.addPage();
    doc.y = 60;
    sectionLabel('Part 2 Testimonial');
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY);
    doc.text('My report on the service of the above-named during the period stated is as follows:', ML, doc.y, { width: CW });
    doc.y += 6;
    for (const heading of ['Conduct:', 'Ability:']) {
      doc.font('NunitoSans-SemiBold').fontSize(9).fillColor(DEEP_NAVY).text(heading, ML, doc.y);
      blankLines(4);
      doc.y += 6;
    }

    // ── Part 3 Official endorsement ───────────────────────
    sectionLabel('Part 3 Official endorsement');
    if (t.served_as_master) {
      note('The seafarer served as Master. MGN 496 5.3: the testimonial must be signed by the owner or a responsible person from the management company, such as a Company Director or Superintendent.');
    }
    field('Signed', null);
    field('Name (print)', null);
    ensureSpace(20);
    {
      const y = Math.round(doc.y);
      doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY).text('Position', ML, y);
      tickBox(ML + 175, y + 1, false);
      doc.fillColor(DEEP_NAVY).text('Master', ML + 188, y);
      tickBox(ML + 270, y + 1, false);
      doc.fillColor(DEEP_NAVY).text('Responsible person', ML + 283, y);
      doc.y = y + 18;
    }
    field('If Master, CoC No.', null);
    field('Issuing administration', null);
    field('If responsible person, organisation', null);
    field('Position in organisation', null);
    field('Date', null);
    ensureSpace(80);
    doc.font('NunitoSans').fontSize(9).fillColor(TEXT_BODY).text('Vessel / company stamp:', ML, doc.y);
    const stampY = doc.y + 4;
    doc.strokeColor(BORDER).lineWidth(0.5).rect(ML, stampY, 180, 64).stroke();
    doc.y = stampY + 76;

    // ── How the figures were prepared ─────────────────────
    sectionLabel('How the figures were prepared');
    note(
      "Prepared from the seafarer's SeaTime Tracker record of confirmed service, for the signatory to check against the vessel's own records. " +
      'Sea service follows MGN 496 4.1 (time at sea, at anchor, on transits and in port with the work; yard service excluded). ' +
      'A day is a date with at least 4 hours of service, and a month is 30 days (MSF 4257). ' +
      'Watchkeeping days are only those the seafarer logged as watchkeeping, or sea days where they were the sole watchkeeper; nothing is inferred from vessel movements.',
    );
    if (t.dual_capacity_days > 0) {
      note(`${t.dual_capacity_days} days were served in a dual deck and engine capacity and are counted at 50% (MGN 496 4.5).`);
    }
    note('MGN 496 5.2: send this with discharge book entries or certificates of discharge, or an MCA approved service record book.');

    // ── Service record appendix ────────────────────────────
    doc.addPage();
    doc.y = 60;
    sectionLabel(`Service record: ${vessel.vessel_name}`);
    note(`${t.entries.length} entries${t.signed_entries ? `, ${t.signed_entries} signed on the day` : ''}. Hours are from sign-on to sign-off for each entry, in UTC.`);
    const cols = [62, 105, 105, 40, 70, 50, CW - 432];
    const heads = ['Date', 'From', 'To', 'Hours', 'Service', 'Capacity', 'Signed'];
    const headerRow = () => {
      const y = Math.round(doc.y);
      doc.fillColor(LIGHT_BG).rect(ML, y - 2, CW, 15).fill();
      doc.font('NunitoSans-SemiBold').fontSize(7).fillColor(STEEL_BLUE);
      let x = ML;
      heads.forEach((h, i) => { doc.text(h.toUpperCase(), x + 3, y + 1, { width: cols[i] - 6 }); x += cols[i]; });
      doc.y = y + 17;
    };
    headerRow();
    for (const e of t.entries) {
      const signed = typeof e.signature_image === 'string' && e.signature_image.startsWith('data:image/');
      const rowH = signed ? 24 : 15;
      if (doc.y + rowH > PAGE_BOTTOM) { doc.addPage(); doc.y = 60; headerRow(); }
      const y = Math.round(doc.y);
      const cells = [
        ukDate(new Date(e.start_time)),
        e.from_port || '',
        e.to_port || '',
        hoursOf(e).toFixed(1),
        SERVICE_LABELS[e.service_type || 'actual_sea_service'] ?? '',
        annexCCapacity(e.rank) ?? '',
      ];
      doc.font('NunitoSans').fontSize(7.5).fillColor(DEEP_NAVY);
      let x = ML;
      cells.forEach((c, i) => { doc.text(c, x + 3, y, { width: cols[i] - 6, height: rowH, ellipsis: true }); x += cols[i]; });
      if (signed) {
        try {
          const buf = Buffer.from(e.signature_image!.split(',')[1], 'base64');
          doc.image(buf, x + 3, y - 2, { fit: [cols[6] - 6, 22] });
        } catch (err) {
          logger.warn({ err }, 'Failed to embed entry signature');
        }
      }
      doc.strokeColor(BORDER).lineWidth(0.3).moveTo(ML, y + rowH - 2).lineTo(ML + CW, y + rowH - 2).stroke();
      doc.y = y + rowH;
    }
  });

  // ── Footer on every page ─────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    const fy = doc.page.height - 55;
    // The footer sits in the bottom margin; lift it so pdfkit does not start a new page
    doc.page.margins.bottom = 0;
    doc.strokeColor(BORDER).lineWidth(0.5).moveTo(ML, fy).lineTo(PW - ML, fy).stroke();
    doc.font('NunitoSans').fontSize(7).fillColor(TEXT_BODY);
    doc.text(`${seafarerName}  |  Deck (Workboat) Testimonial`, ML, fy + 8, { width: 300, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}  |  Generated by SeaTime Tracker`, 0, fy + 8, { width: PW - ML, align: 'right', lineBreak: false });
  }
  return doc;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.get<{ Querystring: { vesselId?: string } }>('/api/reports/workboat-testimonial', {
    schema: {
      description: 'MGN 496 Annex C Deck (Workboat) Testimonial, one per vessel, as a PDF to be signed by the Master or company (requires authentication and an active subscription)',
      tags: ['reports'],
      querystring: {
        type: 'object',
        properties: { vesselId: { type: 'string', description: 'Only this vessel (default: every vessel with qualifying service)' } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    const [user] = await app.db.select().from(authSchema.user).where(eq(authSchema.user.id, userId));
    if (!user) {
      return reply.code(401).send({ error: 'User not found' });
    }
    const status = (user as any).subscription_status || 'inactive';
    const expires = (user as any).subscription_expires_at ? new Date((user as any).subscription_expires_at) : null;
    const active = (status === 'active' || status === 'trial') && (!expires || (!isNaN(expires.getTime()) && expires > new Date()));
    if (!active) {
      return reply.code(403).send({ error: 'Active subscription required to generate reports' });
    }
    const { vesselId } = request.query;

    let entries = await app.db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    if (vesselId) entries = entries.filter((e) => e.vessel_id === vesselId);
    // Name and flag as they were on each entry's day; sole watchkeeper periods by date
    entries = await entriesWithIdentity(app, entries);
    entries = await entriesWithSoleWatch(app, entries);

    const vessels = await app.db.select().from(schema.vessels).where(eq(schema.vessels.user_id, userId));
    const leave = await app.db.select().from(schema.leave_periods).where(eq(schema.leave_periods.user_id, userId));

    // One testimonial per vessel identity: a renamed vessel gets one per name,
    // as each name is a separate entry in a discharge book.
    const groups = new Map<string, typeof entries>();
    for (const e of [...entries].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())) {
      const key = `${e.vessel_id}|${(e as { identity_period?: string }).identity_period ?? 'start'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    const blocks: TestimonialBlock[] = [];
    for (const [key, group] of groups) {
      const record = vessels.find((v) => v.id === key.split('|')[0]);
      if (!record) continue;
      const vesselLeave = leave
        .filter((l) => l.vessel_id === record.id)
        .map((l) => ({ start_date: String(l.start_date).slice(0, 10), end_date: String(l.end_date).slice(0, 10), reason: l.reason }));
      const t = buildWorkboatTestimonial(group as unknown as TestimonialEntry[], vesselLeave);
      if (t) blocks.push({ vessel: { ...record, ...(group[0]?.vessel ?? {}) }, t });
    }
    if (blocks.length === 0) {
      return reply.code(404).send({ error: 'No confirmed deck sea service to put on a testimonial' });
    }

    const doc = testimonialPdf(blocks, {
      name: user.name || '',
      dateOfBirth: (user as any).date_of_birth ? ukDate(new Date((user as any).date_of_birth)) : '',
      dischargeBook: (user as any).srb_no || '',
    }, app.logger);
    const pages = doc.bufferedPageRange().count;
    doc.end();

    app.logger.info({ userId, vessels: blocks.length, pages }, 'Workboat testimonial generated');
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="workboat_testimonial_${new Date().toISOString().split('T')[0]}.pdf"`);
    return reply.send(doc as unknown as Readable);
  });
}
