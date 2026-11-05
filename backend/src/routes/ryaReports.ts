import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { entryFixes } from "../services/trackDistance.js";
import { cumulativeTrackDistanceNm } from "../utils/seaTime.js";
import { getCoastlineClassifier } from "../utils/seaAreas/singleton.js";
import { OCEAN_OFFSHORE_FROM_LAND_NM, ryaHeldFrom, ryaService } from "../utils/ryaService.js";

/**
 * RYA Yachtmaster sea time (utils/ryaService.ts): days, skipper days, miles,
 * tidal days, night hours and qualifying passages per discipline, against the
 * targets the user's certificates allow. Asked for on its own by the Yachtmaster
 * progress card, because the mileage reads every AIS fix in range.
 */
export function register(app: App, fastify: FastifyInstance) {
  fastify.get("/api/reports/rya-service", {
    schema: { description: "Sea time toward the RYA Yachtmaster exams, counted the RYA's way", tags: ["reports"] },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: "Authentication required" });
    const cutoff = new Date();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 10);
    const entries = (await app.db.query.sea_time_entries.findMany({
      with: { vessel: true },
      where: eq(schema.sea_time_entries.user_id, userId),
    })).filter((e) => e.status === "confirmed" && new Date(e.start_time) >= cutoff && e.vessel?.sector !== "commercial");
    const certs = await app.db
      .select({ certificate_type: schema.certificates.certificate_type, discipline: schema.certificates.discipline })
      .from(schema.certificates)
      .where(eq(schema.certificates.user_id, userId));
    const fixes = await entryFixes(app, userId, entries);
    // Same mileage as services/trackDistance.ts trackDistances, from the one read
    const track = new Map([...fixes].map(([id, f]) => [id, cumulativeTrackDistanceNm(f)] as const));
    const classifier = getCoastlineClassifier();
    return reply.code(200).send(ryaService(entries as any, track, new Date(), {
      fixes,
      held: ryaHeldFrom(certs),
      farFromLand: classifier
        ? (lat, lon) => classifier.isFartherFromLandThan({ lat, lon }, OCEAN_OFFSHORE_FROM_LAND_NM)
        : null,
    }));
  });
}
