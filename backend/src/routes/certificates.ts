import type { FastifyInstance } from "fastify";
import { eq, and, asc } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import {
  REVALIDATION_RULE_BY_TYPE,
  daysToExpiry,
  inAnniversaryWindow,
  revalidationProgress,
} from "../utils/revalidation.js";
import { highSpeedNeeds } from "../utils/highSpeed.js";
import * as authSchema from "../db/auth-schema.js";

/**
 * Maritime certificate types — used by frontend dropdowns and PDF reports.
 * Sorted by typical importance for a deck/engineering officer.
 */
export const CERTIFICATE_TYPES = [
  // STCW basic
  "stcw_basic_safety",
  "stcw_advanced_firefighting",
  "stcw_medical_first_aid",
  "stcw_proficiency_security",
  // Health
  "eng1_medical",
  // Communications
  "gmdss_goc",
  "gmdss_roc",
  // Navigation / Bridge
  "ecdis",
  "radar_observer",
  "radar_arpa",
  // Personal survival
  "personal_survival_techniques",
  // Officer certificates
  "occ_yachtmaster_offshore",
  "occ_yachtmaster_ocean",
  "occ_master_3000gt",
  "occ_oow_3000gt",
  "occ_chief_engineer",
  "occ_second_engineer",
  "coc_master_workboat_500",
  "coc_bml_t2l1",
  "coc_bml_t2l2",
  // USCG Documents
  "uscg_mmc",
  "uscg_twic",
  "uscg_medical_certificate",
  // USCG Deck Endorsements
  "uscg_master_onc_unlimited",
  "uscg_chief_mate_onc_unlimited",
  "uscg_second_mate_onc_unlimited",
  "uscg_third_mate_onc_unlimited",
  "uscg_master_onc_1600grt",
  "uscg_mate_ocean_1600grt",
  "uscg_mate_nc_1600grt",
  "uscg_master_onc_500grt",
  "uscg_mate_ocean_500grt",
  "uscg_mate_nc_500grt",
  "uscg_master_ocean_200grt",
  "uscg_master_nc_200grt",
  "uscg_mate_ocean_200grt",
  "uscg_mate_nc_200grt",
  "uscg_master_nc_100grt",
  "uscg_master_gl_inland",
  "uscg_mate_gl_inland",
  "uscg_master_rivers",
  "uscg_oupv",
  // USCG Towing
  "uscg_master_towing",
  "uscg_mate_pilot_towing",
  "uscg_apprentice_mate_towing",
  "uscg_toar",
  // USCG Offshore
  "uscg_master_osv",
  "uscg_chief_mate_osv",
  "uscg_mate_osv",
  "uscg_oim",
  "uscg_barge_supervisor",
  "uscg_ballast_control_operator",
  // USCG Fishing
  "uscg_master_fishing",
  "uscg_mate_fishing",
  // USCG Engineer Endorsements
  "uscg_chief_engineer",
  "uscg_first_assistant_engineer",
  "uscg_second_assistant_engineer",
  "uscg_third_assistant_engineer",
  "uscg_chief_engineer_limited",
  "uscg_assistant_engineer_limited",
  "uscg_dde",
  "uscg_qmed",
  "uscg_chief_engineer_osv",
  "uscg_assistant_engineer_osv",
  "uscg_chief_engineer_modu",
  "uscg_assistant_engineer_modu",
  "uscg_chief_engineer_fishing",
  "uscg_assistant_engineer_fishing",
  // USCG STCW Endorsements
  "uscg_stcw_master",
  "uscg_stcw_chief_mate",
  "uscg_stcw_oicnw",
  "uscg_stcw_chief_engineer",
  "uscg_stcw_second_engineer",
  "uscg_stcw_oicew",
  "uscg_stcw_eto",
  "uscg_stcw_able_seafarer_deck",
  "uscg_stcw_able_seafarer_engine",
  "uscg_rfpnw",
  "uscg_rfpew",
  "uscg_vso",
  // Other
  "passport",
  "seaman_book",
  "other",
] as const;

const ALLOWED_TYPES_SET = new Set<string>(CERTIFICATE_TYPES);

// Course records from the oral checklist (2.4.0) use "course_<code>", e.g.
// course_pscrb. Codes come from the app's course catalogue.
const COURSE_TYPE = /^course_[a-z0-9_]{2,60}$/;

function isValidCertificateType(t: string): boolean {
  return ALLOWED_TYPES_SET.has(t) || COURSE_TYPE.test(t);
}

/**
 * Validate date relationships for a certificate.
 * Returns { error, warning } — error means reject (400), warning is informational.
 */
function validateCertificateDates(
  issuedDate: string | null | undefined,
  expiryDate: string | null | undefined
): { error?: string; warning?: string } {
  if (issuedDate && expiryDate) {
    const issued = new Date(issuedDate);
    const expiry = new Date(expiryDate);
    if (isNaN(issued.getTime()) || isNaN(expiry.getTime())) {
      return { error: "Invalid date format for issued_date or expiry_date" };
    }
    if (issued >= expiry) {
      return { error: "issued_date must be before expiry_date" };
    }
  }

  if (issuedDate) {
    const issued = new Date(issuedDate);
    if (!isNaN(issued.getTime()) && issued > new Date()) {
      return { warning: "issued_date is in the future" };
    }
  }

  return {};
}

interface CertificateBody {
  certificate_type: string;
  certificate_number?: string | null;
  issuing_body?: string | null;
  issued_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  /** 'sail' or 'power', for RYA Yachtmaster certificates (utils/ryaService.ts). */
  discipline?: string | null;
}

const DISCIPLINES = new Set(["sail", "power"]);

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/certificates - List the user's certificates
  fastify.get("/api/certificates", {
    schema: {
      description: "List all certificates for the authenticated user",
      tags: ["certificates"],
      response: {
        200: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const rows = await app.db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.user_id, userId))
      .orderBy(asc(schema.certificates.expiry_date));

    return reply.code(200).send(rows);
  });

  // GET /api/certificates/revalidation - Revalidation progress for each CoC held
  // (MSN 1861, MGN 496 12.1, MSN 1853 19.3; see utils/revalidation.ts)
  fastify.get("/api/certificates/revalidation", {
    schema: {
      description: "Sea service toward revalidating each certificate of competency the user holds",
      tags: ["certificates"],
      response: {
        200: { type: "array", items: { type: "object", additionalProperties: true } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    const certs = (await app.db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.user_id, userId)))
      .filter((c) => REVALIDATION_RULE_BY_TYPE[c.certificate_type]);
    if (certs.length === 0) return reply.code(200).send([]);

    const entries = await app.db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.user_id, userId),
    });
    const now = new Date();
    return reply.code(200).send(certs.map((c) => {
      const progress = revalidationProgress(REVALIDATION_RULE_BY_TYPE[c.certificate_type], entries as any, now);
      return {
        certificate_id: c.id,
        certificate_type: c.certificate_type,
        expiry_date: c.expiry_date,
        days_to_expiry: daysToExpiry(c.expiry_date, now),
        keeps_anniversary: inAnniversaryWindow(c.expiry_date, now),
        rule: progress.rule.id,
        notice: progress.rule.notice,
        counts: progress.rule.counts,
        routes: progress.routes,
        met: progress.met,
      };
    }));
  });

  // GET /api/certificates/high-speed - Workboat Code Ed. 3 Table A5.1 Note F: the
  // master of a high-speed workboat needs the RYA/MCA Advanced Powerboat Certificate
  fastify.get("/api/certificates/high-speed", {
    schema: {
      description: "Certificates the issuing rules tie to the user's high-speed craft (WBC3 Table A5.1 Note F). null when none of their vessels is a high-speed workboat",
      tags: ["certificates"],
      response: {
        200: { type: ["object", "null"], additionalProperties: true },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }
    const vessels = await app.db.select().from(schema.vessels).where(eq(schema.vessels.user_id, userId));
    if (!vessels.some((v) => v.is_high_speed === true)) return reply.code(200).send(null);
    const [entries, certs, users] = await Promise.all([
      app.db
        .select({ vessel_id: schema.sea_time_entries.vessel_id, rank: schema.sea_time_entries.rank, status: schema.sea_time_entries.status })
        .from(schema.sea_time_entries)
        .where(eq(schema.sea_time_entries.user_id, userId)),
      app.db
        .select({ certificate_type: schema.certificates.certificate_type, expiry_date: schema.certificates.expiry_date })
        .from(schema.certificates)
        .where(eq(schema.certificates.user_id, userId)),
      app.db
        .select({ vessel_sector: authSchema.user.vessel_sector })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, userId))
        .limit(1),
    ]);
    return reply.code(200).send(highSpeedNeeds(vessels, entries, certs, users[0]?.vessel_sector ?? null));
  });

  // POST /api/certificates - Create a new certificate
  fastify.post<{ Body: CertificateBody }>("/api/certificates", {
    schema: {
      description: "Create a new certificate",
      tags: ["certificates"],
      body: {
        type: "object",
        required: ["certificate_type"],
        properties: {
          certificate_type: { type: "string" },
          certificate_number: { type: ["string", "null"] },
          issuing_body: { type: ["string", "null"] },
          issued_date: { type: ["string", "null"] },
          expiry_date: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
          discipline: { type: ["string", "null"], enum: ["sail", "power", null] },
        },
      },
      response: {
        200: { type: "object", additionalProperties: true },
        400: { type: "object", properties: { error: { type: "string" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      return reply.code(401).send({ error: "Authentication required" });
    }

    const body = request.body;
    if (!isValidCertificateType(body.certificate_type)) {
      return reply.code(400).send({ error: "Invalid certificate_type" });
    }

    const dateCheck = validateCertificateDates(body.issued_date, body.expiry_date);
    if (dateCheck.error) {
      return reply.code(400).send({ error: dateCheck.error });
    }

    const [created] = await app.db
      .insert(schema.certificates)
      .values({
        user_id: userId,
        certificate_type: body.certificate_type,
        certificate_number: body.certificate_number || null,
        issuing_body: body.issuing_body || null,
        issued_date: body.issued_date || null,
        expiry_date: body.expiry_date || null,
        notes: body.notes || null,
        discipline: body.discipline && DISCIPLINES.has(body.discipline) ? body.discipline : null,
      })
      .returning();

    app.logger.info(
      { userId, certificateId: created.id, type: body.certificate_type },
      "Certificate created"
    );
    if (dateCheck.warning) {
      return reply.code(200).send({ ...created, warning: dateCheck.warning });
    }
    return reply.code(200).send(created);
  });

  // PUT /api/certificates/:id - Update a certificate
  fastify.put<{ Params: { id: string }; Body: Partial<CertificateBody> }>(
    "/api/certificates/:id",
    {
      schema: {
        description: "Update a certificate",
        tags: ["certificates"],
        params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        body: {
          type: "object",
          properties: {
            certificate_type: { type: "string" },
            certificate_number: { type: ["string", "null"] },
            issuing_body: { type: ["string", "null"] },
            issued_date: { type: ["string", "null"] },
            expiry_date: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
            discipline: { type: ["string", "null"], enum: ["sail", "power", null] },
          },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          401: { type: "object", properties: { error: { type: "string" } } },
          404: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) return reply.code(401).send({ error: "Authentication required" });

      const { id } = request.params;
      const existing = await app.db
        .select()
        .from(schema.certificates)
        .where(and(eq(schema.certificates.id, id), eq(schema.certificates.user_id, userId)));

      if (existing.length === 0) {
        return reply.code(404).send({ error: "Certificate not found" });
      }

      const body = request.body;
      if (body.certificate_type && !isValidCertificateType(body.certificate_type)) {
        return reply.code(400).send({ error: "Invalid certificate_type" });
      }

      // Resolve effective dates: use body value if provided, else fall back to existing record
      const effectiveIssued = body.issued_date !== undefined ? body.issued_date : existing[0].issued_date;
      const effectiveExpiry = body.expiry_date !== undefined ? body.expiry_date : existing[0].expiry_date;
      const dateCheck = validateCertificateDates(effectiveIssued, effectiveExpiry);
      if (dateCheck.error) {
        return reply.code(400).send({ error: dateCheck.error });
      }

      const updateData: any = { updated_at: new Date() };
      if (body.certificate_type !== undefined) updateData.certificate_type = body.certificate_type;
      if (body.certificate_number !== undefined) updateData.certificate_number = body.certificate_number;
      if (body.issuing_body !== undefined) updateData.issuing_body = body.issuing_body;
      if (body.issued_date !== undefined) updateData.issued_date = body.issued_date;
      if (body.expiry_date !== undefined) updateData.expiry_date = body.expiry_date;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.discipline !== undefined) {
        updateData.discipline = body.discipline && DISCIPLINES.has(body.discipline) ? body.discipline : null;
      }

      const [updated] = await app.db
        .update(schema.certificates)
        .set(updateData)
        .where(eq(schema.certificates.id, id))
        .returning();

      if (dateCheck.warning) {
        return reply.code(200).send({ ...updated, warning: dateCheck.warning });
      }
      return reply.code(200).send(updated);
    }
  );

  // DELETE /api/certificates/:id - Delete a certificate
  fastify.delete<{ Params: { id: string } }>("/api/certificates/:id", {
    schema: {
      description: "Delete a certificate",
      tags: ["certificates"],
      params: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      response: {
        200: { type: "object", properties: { deleted: { type: "boolean" } } },
        401: { type: "object", properties: { error: { type: "string" } } },
        404: { type: "object", properties: { error: { type: "string" } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });

    const { id } = request.params;
    const existing = await app.db
      .select()
      .from(schema.certificates)
      .where(and(eq(schema.certificates.id, id), eq(schema.certificates.user_id, userId)));

    if (existing.length === 0) {
      return reply.code(404).send({ error: "Certificate not found" });
    }

    await app.db.delete(schema.certificates).where(eq(schema.certificates.id, id));
    return reply.code(200).send({ deleted: true });
  });
}
