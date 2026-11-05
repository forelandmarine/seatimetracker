import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { serviceDatesAnyHours } from "../utils/seaTime.js";
import { effectiveTradeArea } from "../utils/boatmasterService.js";
import {
  BML_LICENCE_TYPES,
  deckEntries,
  endorsementFromDay,
  groupFixesByVesselDay,
  lkeServiceDays,
  type LkeDay,
} from "../utils/boatmasterEndorsements.js";

/**
 * Boatmasters' Licence paperwork, pre-filled from the user's confirmed service:
 *
 * - format=msf4366: the BML Work Record (MSF 4366 REV 0315, Part 2 columns).
 *   MSN 1853 13.2 accepts other formats that show every detail the form asks
 *   for, so the page carries the same columns and leaves the employer's or
 *   master's signature and the validation box blank to sign.
 * - format=pla: the Port of London Details of Service sheet for the Local
 *   Knowledge Endorsement, one row per day with AIS positions in the area.
 *
 * Only commercial, workboat and tug vessels are included, and only deck service
 * (no engine ranks, no yard service), as BML service needs.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = fs.existsSync(path.join(__dirname, "..", "assets"))
  ? path.join(__dirname, "..", "assets")
  : path.join(__dirname, "assets");

const RANK_LABELS: Record<string, string> = {
  master: 'Master',
  chief_officer: 'Mate',
  second_officer: 'Mate',
  third_officer: 'Mate',
  oow: 'Mate',
  cadet: 'Trainee',
  rating: 'Deckhand',
};

/** MSF 4366 Type/Operation code for a vessel. */
function operationCode(v: { is_passenger?: boolean | null; is_tug?: boolean | null; is_workboat?: boolean | null }): string {
  if (v.is_passenger) return 'PAX';
  if (v.is_tug) return 'TP';
  if (v.is_workboat) return 'WB';
  return '';
}

/** PLA class of vessel, from the same flags. */
function vesselClass(v: { is_passenger?: boolean | null; is_tug?: boolean | null; is_workboat?: boolean | null }): string {
  if (v.is_passenger) return 'Passenger';
  if (v.is_tug) return 'Tug / towing';
  if (v.is_workboat) return 'Workboat';
  return '';
}

const ukDate = (d: string) => d.split('-').reverse().join('/');

/** Date and time in London (the PLA sheet asks for local times). */
function londonDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return parts.replace(',', '');
}

interface WorkRow {
  from: string;
  to: string;
  vessel: string;
  code: string;
  length: string;
  area: string;
  role: string;
  days: number;
}

export function register(app: App, fastify: FastifyInstance) {
  fastify.get<{ Querystring: { format?: string } }>('/api/reports/boatmaster', {
    schema: {
      description: "Boatmasters' Licence Work Record (MSF 4366) or Port of London LKE Details of Service, as a PDF (requires authentication and an active subscription)",
      tags: ['reports'],
      querystring: {
        type: 'object',
        properties: { format: { type: 'string', enum: ['msf4366', 'pla'] } },
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
    const format = request.query.format === 'pla' ? 'pla' : 'msf4366';

    const all = await app.db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    const commercial = all.filter(
      (e) => e.vessel && (e.vessel.sector === 'commercial' || e.vessel.is_tug === true || e.vessel.is_workboat === true),
    );
    const deck = deckEntries(commercial as any) as typeof commercial;

    let fixes: any[] = [];
    try {
      const rows = await app.db.execute(sql`
        select distinct a.vessel_id, a.check_time, a.area_category, a.is_tidal, a.latitude, a.longitude
        from sea_time_entries e
        join vessels v on v.id = e.vessel_id
        join ais_checks a on a.vessel_id = e.vessel_id
          and a.check_time >= e.start_time
          and a.check_time <= coalesce(e.end_time, e.start_time)
        where e.user_id = ${userId} and e.status = 'confirmed' and a.season is not null
          and (v.is_tug = true or v.is_workboat = true or v.sector = 'commercial')
      `);
      fixes = ((rows as any).rows ?? rows).map((r: any) => ({ ...r, vessel_id: String(r.vessel_id) }));
    } catch (err) {
      app.logger.warn({ err }, 'Sea-area fix lookup failed; Boatmasters report has no areas');
    }
    const fixesByDay = groupFixesByVesselDay(fixes);

    let licence: { issued: string | null; number: string | null } = { issued: null, number: null };
    try {
      const rows = await app.db.execute(sql`
        select issued_date::text as issued, certificate_number as number from certificates
        where user_id = ${userId} and certificate_type in (${sql.join(BML_LICENCE_TYPES.map((t) => sql`${t}`), sql`, `)})
        order by issued_date asc nulls last limit 1
      `);
      const r = ((rows as any).rows ?? rows)[0];
      if (r) licence = { issued: r.issued ?? null, number: r.number ?? null };
    } catch (err) {
      app.logger.warn({ err }, 'Boatmasters licence lookup failed');
    }

    const vessels = new Map(deck.map((e) => [e.vessel_id, e.vessel!]));

    // --- MSF 4366 rows: one per run of service on a vessel in one role, split
    // where there is a gap of more than 14 days. ---
    const workRows: WorkRow[] = [];
    if (format === 'msf4366') {
      for (const [vesselId, vessel] of vessels) {
        const mine = deck.filter((e) => e.vessel_id === vesselId);
        const byDate = new Map<string, { role: string; ports: string[]; inland: boolean }>();
        for (const e of mine) {
          for (const d of serviceDatesAnyHours([e] as any)) {
            const cur = byDate.get(d) ?? { role: '', ports: [], inland: false };
            if (!cur.role) cur.role = RANK_LABELS[e.rank ?? ''] ?? (vessel.tug_capacity === 'officer' ? 'Mate' : 'Deckhand');
            if (e.from_port) cur.ports.push(e.from_port);
            if (e.to_port) cur.ports.push(e.to_port);
            if (effectiveTradeArea(e as any) === 'inland') cur.inland = true;
            byDate.set(d, cur);
          }
        }
        const dates = [...byDate.keys()].sort();
        let run: string[] = [];
        const flush = () => {
          if (run.length === 0) return;
          const cats = new Set<string>();
          let tidal = false;
          let nonTidal = false;
          const ports = new Map<string, number>();
          let inland = false;
          for (const d of run) {
            for (const f of fixesByDay.get(`${vesselId}|${d}`) ?? []) {
              if (['A', 'B', 'C', 'D'].includes(f.area_category ?? '')) cats.add(f.area_category);
              if (f.is_tidal === true) tidal = true;
              if (f.is_tidal === false) nonTidal = true;
            }
            const info = byDate.get(d)!;
            for (const p of info.ports) ports.set(p, (ports.get(p) ?? 0) + 1);
            if (info.inland) inland = true;
          }
          const route = [...ports.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p).join(', ');
          const water = cats.size
            ? `Cat ${[...cats].sort().join(', ')}${tidal && nonTidal ? ' (tidal and non-tidal)' : tidal ? ' (tidal)' : nonTidal ? ' (non-tidal)' : ''}`
            : inland ? 'Inland waters' : '';
          workRows.push({
            from: run[0],
            to: run[run.length - 1],
            vessel: vessel.vessel_name,
            code: operationCode(vessel),
            length: vessel.length_metres ? `${Number(vessel.length_metres).toFixed(1)} m` : '',
            area: [route, water].filter(Boolean).join('. '),
            role: byDate.get(run[0])!.role,
            days: run.length,
          });
          run = [];
        };
        for (const d of dates) {
          const prev = run[run.length - 1];
          const gap = prev ? (Date.parse(d) - Date.parse(prev)) / 86400000 : 0;
          if (prev && (gap > 14 || byDate.get(d)!.role !== byDate.get(prev)!.role)) flush();
          run.push(d);
        }
        flush();
      }
      workRows.sort((a, b) => a.from.localeCompare(b.from));
    }

    // --- PLA rows: one per day in the LKE area, after the licence. ---
    const lkeDays: LkeDay[] =
      format === 'pla' ? lkeServiceDays(deck as any, fixesByDay, endorsementFromDay(licence.issued)) : [];

    // --- PDF ---
    const doc = new PDFDocument({ bufferPages: true, size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 50, left: 36, right: 36 } });
    const fontsDir = path.join(ASSETS_DIR, 'fonts');
    try {
      doc.registerFont('Body', path.join(fontsDir, 'NunitoSans-Regular.ttf'));
      doc.registerFont('Bold', path.join(fontsDir, 'NunitoSans-SemiBold.ttf'));
    } catch {
      doc.registerFont('Body', 'Helvetica');
      doc.registerFont('Bold', 'Helvetica-Bold');
    }
    const NAVY = '#040D1A';
    const BODY = '#4A5568';
    const BORDER = '#CBD5E0';
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const title = format === 'pla' ? 'DETAILS OF SERVICE: PORT OF LONDON LOCAL KNOWLEDGE ENDORSEMENT' : "BOATMASTERS' LICENCE WORK RECORD";
    doc.font('Bold').fontSize(14).fillColor(NAVY).text(title, left, 40, { width });
    doc.font('Body').fontSize(9).fillColor(BODY).text(
      format === 'pla'
        ? 'In the layout of the PLA Details of Service template. One row per day with AIS positions in the tidal Thames between Putney Bridge and Margaretness. Times are London local time.'
        : 'In the format of MSF 4366 (Part 2), as MSN 1853 13.2 allows. Days are UTC dates with logged deck service. The employer or master signs each row.',
      { width },
    );
    doc.moveDown(0.6);

    const dob = (user as any).date_of_birth ? ukDate(String((user as any).date_of_birth).slice(0, 10)) : '';
    const details: [string, string][] = [
      ['Name', user.name ?? ''],
      ['Date of birth', dob],
      ['Nationality', (user as any).nationality ?? ''],
      ["Boatmasters' Licence no.", licence.number ?? ''],
      ['Email', user.email ?? ''],
    ];
    doc.fontSize(9);
    let y = doc.y;
    const colW = width / details.length;
    details.forEach(([k, v], i) => {
      doc.font('Bold').fillColor(NAVY).text(k, left + i * colW, y, { width: colW - 8 });
      doc.font('Body').fillColor(BODY).text(v || '-', left + i * colW, y + 12, { width: colW - 8 });
    });
    y += 34;

    type Col = { label: string; w: number };
    const cols: Col[] =
      format === 'pla'
        ? [
            { label: 'Vessel Name', w: 0.14 },
            { label: 'Employer', w: 0.12 },
            { label: 'Route and Direction', w: 0.2 },
            { label: 'Date and Time From', w: 0.11 },
            { label: 'Date and Time To', w: 0.11 },
            { label: 'Total Days', w: 0.06 },
            { label: 'Onboard Role', w: 0.1 },
            { label: 'Class of Vessel', w: 0.08 },
            { label: 'Signature', w: 0.08 },
          ]
        : [
            { label: 'From', w: 0.07 },
            { label: 'To', w: 0.07 },
            { label: 'Vessel Name', w: 0.12 },
            { label: 'Type / Operation', w: 0.07 },
            { label: 'Length', w: 0.05 },
            { label: 'No. of Passengers', w: 0.07 },
            { label: 'Operating Area or Route (incl. MSN 1837 category)', w: 0.2 },
            { label: 'Role on Board', w: 0.07 },
            { label: 'No. of Days', w: 0.05 },
            { label: 'Owner or Employer', w: 0.09 },
            { label: "Employer's / Master's Signature", w: 0.08 },
            { label: 'Validation', w: 0.06 },
          ];

    const drawHeader = () => {
      let x = left;
      doc.font('Bold').fontSize(7.5).fillColor(NAVY);
      const h = Math.max(26, ...cols.map((c) => doc.heightOfString(c.label, { width: c.w * width - 6 }) + 8));
      for (const c of cols) {
        const w = c.w * width;
        doc.rect(x, y, w, h).fillAndStroke('#EDF2F7', BORDER);
        doc.fillColor(NAVY).text(c.label, x + 3, y + 4, { width: w - 6 });
        x += w;
      }
      y += h;
    };
    const drawRow = (cells: string[]) => {
      doc.font('Body').fontSize(7.5);
      const h = Math.max(
        22,
        ...cells.map((t, i) => doc.heightOfString(t || ' ', { width: cols[i].w * width - 6 }) + 8),
      );
      if (y + h > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
        doc.font('Body').fontSize(7.5);
      }
      let x = left;
      cells.forEach((t, i) => {
        const w = cols[i].w * width;
        doc.rect(x, y, w, h).stroke(BORDER);
        doc.fillColor(BODY).text(t, x + 3, y + 4, { width: w - 6 });
        x += w;
      });
      y += h;
    };

    drawHeader();
    let total = 0;
    if (format === 'pla') {
      for (const d of lkeDays) {
        const v = vessels.get(d.vessel_id);
        if (!v) continue;
        const entry = deck.find((e) => e.vessel_id === d.vessel_id && serviceDatesAnyHours([e] as any).has(d.date));
        const route = d.sections.length === 2 ? 'Upper and Lower' : d.sections[0] === 'upper' ? 'Upper (London Bridge to Putney)' : 'Lower (Margaretness to London Bridge)';
        const dir = d.upriver && d.downriver ? 'up and down river' : d.upriver ? 'upriver' : d.downriver ? 'downriver' : 'in the area';
        drawRow([
          v.vessel_name,
          '',
          `${route}, ${dir}${d.night ? ', in darkness' : ''}`,
          londonDateTime(d.first),
          londonDateTime(d.last),
          '1',
          RANK_LABELS[entry?.rank ?? ''] ?? 'Deckhand',
          vesselClass(v),
          '',
        ]);
        total++;
      }
    } else {
      for (const r of workRows) {
        drawRow([ukDate(r.from), ukDate(r.to), r.vessel, r.code, r.length, '', r.area, r.role, String(r.days), '', '', '']);
        total += r.days;
      }
    }
    y += 8;
    if (y > doc.page.height - doc.page.margins.bottom - 60) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.font('Bold').fontSize(9).fillColor(NAVY).text(`Total days: ${total}`, left, y);
    doc.font('Body').fontSize(8).fillColor(BODY).text(
      format === 'pla'
        ? `${licence.issued ? `Days after the Boatmasters' Licence issued ${ukDate(licence.issued)}.` : "No Boatmasters' Licence issue date on file, so every day in the last 5 years is listed; the LKE counts only service after the licence service."} The LKE needs at least 60 days in varying conditions, including trips in different directions and in darkness, the last day at least 6 months after the first (MSN 1853 Annex 5 Table B). Fill in the employer and have each row signed before sending it to the PLA.`
        : 'Type/Operation codes as MSF 4366: PAX passenger, TP towing and pushing, WB workboat. Add the owner or employer and the number of passengers, then have each row signed. Areas come from AIS positions and the MSN 1837 categorisation, as guidance; check them before signing.',
      left,
      y + 14,
      { width },
    );

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font('Body').fontSize(7).fillColor(BODY).text(
        `Page ${i + 1} of ${range.count}  |  Generated by SeaTime Tracker on ${ukDate(new Date().toISOString().slice(0, 10))}`,
        left,
        doc.page.height - 30,
        { width, align: 'right', lineBreak: false },
      );
    }
    doc.end();

    app.logger.info({ userId, format, rows: format === 'pla' ? lkeDays.length : workRows.length }, 'Boatmasters report generated');
    const name = format === 'pla' ? 'PLA_Details_of_Service' : 'BML_Work_Record_MSF4366';
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${name}_${new Date().toISOString().slice(0, 10)}.pdf"`);
    return reply.send(doc as unknown as Readable);
  });
}
