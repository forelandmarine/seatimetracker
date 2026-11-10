import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import * as schema from "../db/schema.js";
import type { FastifyInstance } from "fastify";
import type { App } from "../index.js";

/**
 * Session lookups, cached for a short time.
 *
 * Every signed-in request starts by reading its session row, and the database
 * is a long round trip away from the server, so the lookup alone was about half
 * the time of most requests. A session found here is kept for SESSION_CACHE_TTL_MS.
 * The cache is emptied whenever anything might remove a session (sign out,
 * password change or reset, account deletion), and an entry that looks expired
 * is always re-read, so a session the database still holds is never refused.
 */
const SESSION_CACHE_TTL_MS = 60_000;
const SESSION_CACHE_MAX = 5_000;

export interface SessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
}

const sessionCache = new Map<string, { session: SessionRow; cachedAt: number }>();

/** Forget every cached session (after anything that may delete or replace sessions). */
export function clearSessionCache(): void {
  sessionCache.clear();
}

/** The session for a token, from the cache or the database. Expiry is left to the caller. */
export async function findSession(app: App, token: string): Promise<SessionRow | null> {
  const now = Date.now();
  const hit = sessionCache.get(token);
  if (hit && now - hit.cachedAt < SESSION_CACHE_TTL_MS && hit.session.expiresAt.getTime() > now) {
    return hit.session;
  }

  const sessions = await app.db
    .select({ id: authSchema.session.id, userId: authSchema.session.userId, expiresAt: authSchema.session.expiresAt })
    .from(authSchema.session)
    .where(eq(authSchema.session.token, token));

  if (sessions.length === 0) {
    sessionCache.delete(token);
    return null;
  }

  const session = sessions[0];
  if (sessionCache.size >= SESSION_CACHE_MAX) sessionCache.clear();
  sessionCache.set(token, { session, cachedAt: now });
  return session;
}

/**
 * Empty the session cache after any request that can remove sessions: every
 * non-GET /api/auth/* route (sign out, password change and reset, sign in,
 * which also prunes expired sessions) and account deletion.
 */
export function registerSessionCacheInvalidation(fastify: FastifyInstance): void {
  fastify.addHook('onResponse', async (request) => {
    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    const path = request.url.split('?')[0];
    if (path.startsWith('/api/auth/') || path === '/api/users/me') clearSessionCache();
  });
}

/**
 * Extract user ID from authentication token in request header
 * Returns user ID if authenticated, null if not authenticated
 */
export async function extractUserIdFromRequest(
  request: any,
  app: App
): Promise<string | null> {
  try {
    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return null;
    }

    // Find user session
    const session = await findSession(app, token);

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      return null;
    }

    return session.userId;
  } catch (error) {
    // Rethrow DB/infrastructure errors so callers can return 500 instead of 401
    throw error;
  }
}

/**
 * Require authentication - throw 401 error if not authenticated
 */
export async function requireAuth(
  request: any,
  app: App
): Promise<string> {
  const userId = await extractUserIdFromRequest(request, app);
  if (!userId) {
    throw new Error('Authentication required');
  }
  return userId;
}

/**
 * Verify that a user owns a vessel
 */
export async function verifyVesselOwnership(
  app: App,
  vesselId: string,
  userId: string
): Promise<boolean> {
  const vessels = await app.db
    .select()
    .from(schema.vessels)
    .where(eq(schema.vessels.id, vesselId));

  if (vessels.length === 0) {
    return false;
  }

  return vessels[0].user_id === userId;
}
