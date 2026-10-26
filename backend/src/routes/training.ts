import type { FastifyInstance } from 'fastify';
import { and, gte, inArray, eq, asc } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { extractUserIdFromRequest } from '../middleware/auth.js';

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/training/course-dates?providers=a,b&course=pscrb - upcoming dates for "Find a course"
  fastify.get<{ Querystring: { providers: string; course?: string } }>('/api/training/course-dates', {
    schema: {
      description: 'Upcoming course dates for training providers in the app directory',
      tags: ['training'],
      querystring: {
        type: 'object',
        required: ['providers'],
        properties: { providers: { type: 'string', maxLength: 4000 }, course: { type: 'string', maxLength: 80 } },
      },
      response: { 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const ids = request.query.providers.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    if (ids.length === 0) return reply.send({ dates: [] });
    const today = new Date().toISOString().slice(0, 10);
    const where = [
      inArray(schema.training_course_dates.provider_id, ids),
      gte(schema.training_course_dates.start_date, today),
    ];
    if (request.query.course) where.push(eq(schema.training_course_dates.course_code, request.query.course));
    const rows = await app.db
      .select({
        provider_id: schema.training_course_dates.provider_id,
        course_code: schema.training_course_dates.course_code,
        start_date: schema.training_course_dates.start_date,
        end_date: schema.training_course_dates.end_date,
        price_text: schema.training_course_dates.price_text,
        availability_text: schema.training_course_dates.availability_text,
        booking_url: schema.training_course_dates.booking_url,
      })
      .from(schema.training_course_dates)
      .where(and(...where))
      .orderBy(asc(schema.training_course_dates.start_date))
      .limit(500);
    return reply.send({ dates: rows });
  });
}
