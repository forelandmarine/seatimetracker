import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";
import { trackDistances } from "../services/trackDistance.js";
import { ryaService } from "../utils/ryaService.js";

/**
 * RYA Yachtmaster sea time (utils/ryaService.ts): days, skipper days, miles,
 * tidal days and qualifying passages per discipline. Asked for on its own by the
 * Yachtmaster progress card, because the mileage reads every AIS fix in range.
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
    const track = await trackDistances(app, userId, entries);
    return reply.code(200).send(ryaService(entries as any, track));
  });
}
