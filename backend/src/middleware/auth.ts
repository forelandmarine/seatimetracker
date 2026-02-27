import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

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
    const sessions = await app.db
      .select()
      .from(authSchema.session)
      .where(eq(authSchema.session.token, token));

    if (sessions.length === 0) {
      return null;
    }

    const session = sessions[0];

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      return null;
    }

    return session.userId;
  } catch (error) {
    return null;
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
