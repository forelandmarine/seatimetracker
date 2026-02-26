/**
 * Users routes
 * Handles user account management including deletion
 */

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.js";
import * as authSchema from "../db/auth-schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

export function register(app: App, fastify: FastifyInstance) {
  // DELETE /api/users/me - Delete authenticated user's account and all associated data
  fastify.delete<{}>('/api/users/me', {
    schema: {
      description: 'Delete authenticated user account and all associated data (permanent, irreversible)',
      tags: ['users'],
      security: [{ bearerAuth: [] }],
      response: {
        204: { type: 'null' },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Account deletion attempted without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Starting account deletion for user');

    try {
      // Use a transaction to ensure all-or-nothing deletion
      await app.db.transaction(async (tx) => {
        // Verify user exists
        const userRecord = await tx.query.user.findFirst({
          where: eq(authSchema.user.id, userId),
        });

        if (!userRecord) {
          app.logger.warn({ userId }, 'User not found during deletion');
          throw new Error('User not found');
        }

        // Get all vessels owned by the user to verify ownership
        const userVessels = await tx
          .select({ id: schema.vessels.id })
          .from(schema.vessels)
          .where(eq(schema.vessels.user_id, userId));

        const vesselIds = userVessels.map((v) => v.id);

        app.logger.info(
          { userId, vesselCount: vesselIds.length },
          'Found vessels to delete'
        );

        // Delete in order of dependencies (respecting foreign key constraints)

        // 1. Delete AIS debug logs (depends on vessels)
        if (vesselIds.length > 0) {
          await tx
            .delete(schema.ais_debug_logs)
            .where(eq(schema.ais_debug_logs.user_id, userId));

          app.logger.debug({ userId }, 'Deleted AIS debug logs');
        }

        // 2. Delete AIS query timestamps (depends on vessels - no user_id field, so delete by vessel_id)
        if (vesselIds.length > 0) {
          // ais_query_timestamps doesn't have user_id, but depends on vessels
          // Since we're deleting vessels, cascade should handle this
          // But we'll explicitly delete by checking which timestamps belong to the user's vessels
          for (const vesselId of vesselIds) {
            await tx
              .delete(schema.ais_query_timestamps)
              .where(eq(schema.ais_query_timestamps.vessel_id, vesselId));
          }

          app.logger.debug(
            { userId, vesselCount: vesselIds.length },
            'Deleted AIS query timestamps'
          );
        }

        // 3. Delete scheduled tasks (depends on vessels)
        if (vesselIds.length > 0) {
          await tx
            .delete(schema.scheduled_tasks)
            .where(eq(schema.scheduled_tasks.user_id, userId));

          app.logger.debug({ userId }, 'Deleted scheduled tasks');
        }

        // 4. Delete AIS checks (depends on vessels)
        if (vesselIds.length > 0) {
          await tx
            .delete(schema.ais_checks)
            .where(eq(schema.ais_checks.user_id, userId));

          app.logger.debug({ userId }, 'Deleted AIS checks');
        }

        // 5. Delete sea time entries (depends on vessels)
        if (vesselIds.length > 0) {
          await tx
            .delete(schema.sea_time_entries)
            .where(eq(schema.sea_time_entries.user_id, userId));

          app.logger.debug({ userId }, 'Deleted sea time entries');
        }

        // 6. Delete vessels
        await tx
          .delete(schema.vessels)
          .where(eq(schema.vessels.user_id, userId));

        app.logger.debug({ userId }, 'Deleted vessels');

        // 7. Delete notification schedules
        await tx
          .delete(schema.notification_schedules)
          .where(eq(schema.notification_schedules.user_id, userId));

        app.logger.debug({ userId }, 'Deleted notification schedules');

        // 8. Delete sessions (depends on user, cascade delete should handle this but explicit delete is safer)
        await tx
          .delete(authSchema.session)
          .where(eq(authSchema.session.userId, userId));

        app.logger.debug({ userId }, 'Deleted sessions');

        // 9. Delete accounts (depends on user, cascade delete should handle this but explicit delete is safer)
        await tx
          .delete(authSchema.account)
          .where(eq(authSchema.account.userId, userId));

        app.logger.debug({ userId }, 'Deleted accounts');

        // 10. Finally, delete the user record
        await tx
          .delete(authSchema.user)
          .where(eq(authSchema.user.id, userId));

        app.logger.info({ userId }, 'User account deleted successfully');
      });

      app.logger.info({ userId }, 'Account deletion completed successfully');
      return reply.code(204).send();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      app.logger.error(
        { userId, err: error, errorMessage },
        'Failed to delete user account'
      );

      return reply.code(500).send({
        error: 'Failed to delete account. Please try again later.',
      });
    }
  });
}
