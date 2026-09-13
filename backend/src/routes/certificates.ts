import type { FastifyInstance } from "fastify";
import { eq, and, asc } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

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

function isValidCertificateType(t: string): boolean {
  return ALLOWED_TYPES_SET.has(t);
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
  image_url?: string | null;
}

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
          image_url: { type: ["string", "null"] },
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
        image_url: body.image_url || null,
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
            image_url: { type: ["string", "null"] },
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
      if (body.image_url !== undefined) updateData.image_url = body.image_url;

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
