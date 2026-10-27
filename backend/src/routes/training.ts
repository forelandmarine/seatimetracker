import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { and, gte, inArray, eq, asc } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import type { App } from '../index.js';
import { extractUserIdFromRequest } from '../middleware/auth.js';
import { TRAINING_PROVIDERS_JSON } from '../data/training-providers.js';

const errorSchema = { type: 'object', properties: { error: { type: 'string' } } };

// The directory is the same for every user, so it is compressed once (about
// 1.6 MB of JSON, 0.3 MB gzipped) and tagged so phones only re-download it
// when it changes. The app keeps its own copy, so HTTP caches are told not to
// store a second one.
const PROVIDERS_ETAG = `"${createHash('sha1').update(TRAINING_PROVIDERS_JSON).digest('hex').slice(0, 16)}"`;
let providersGzip: Buffer | null = null;

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/training/providers - the "Find a course" directory. The app keeps it on the phone.
  fastify.get('/api/training/providers', {
    schema: {
      description: 'Training provider directory for Find a course (ETag / If-None-Match supported)',
      tags: ['training'],
      response: { 304: { type: 'null' }, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    reply.header('etag', PROVIDERS_ETAG).header('cache-control', 'private, no-store').header('vary', 'accept-encoding');
    if (request.headers['if-none-match'] === PROVIDERS_ETAG) return reply.code(304).send();
    reply.type('application/json; charset=utf-8');
    if (/\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''))) {
      providersGzip ??= gzipSync(TRAINING_PROVIDERS_JSON, { level: 9 });
      return reply.header('content-encoding', 'gzip').send(providersGzip);
    }
    return reply.send(TRAINING_PROVIDERS_JSON);
  });

  // GET /api/training/course-dates?course=pscrb (every provider) or ?providers=a,b[&course=]
  fastify.get<{ Querystring: { providers?: string; course?: string } }>('/api/training/course-dates', {
    schema: {
      description: 'Upcoming course dates for training providers in the app directory',
      tags: ['training'],
      querystring: {
        type: 'object',
        properties: { providers: { type: 'string', maxLength: 4000 }, course: { type: 'string', maxLength: 80 } },
      },
      response: { 400: errorSchema, 401: errorSchema },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) return reply.code(401).send({ error: 'Authentication required' });
    const ids = (request.query.providers ?? '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    const course = request.query.course;
    if (ids.length === 0 && !course) return reply.code(400).send({ error: 'Give a course or providers' });
    const today = new Date().toISOString().slice(0, 10);
    const where = [gte(schema.training_course_dates.start_date, today)];
    if (ids.length) where.push(inArray(schema.training_course_dates.provider_id, ids));
    if (course) where.push(eq(schema.training_course_dates.course_code, course));
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
