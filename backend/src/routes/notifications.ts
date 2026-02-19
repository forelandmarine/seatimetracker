import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";
import { extractUserIdFromRequest } from "../middleware/auth.js";

/**
 * Check if a given time in a timezone matches the current time (within 1 minute window)
 */
function isTimeNowInTimezone(scheduledTime: string, timezone: string): boolean {
  try {
    // Parse scheduled time (HH:MM format)
    const [scheduledHours, scheduledMinutes] = scheduledTime.split(':').map(Number);

    // Get current time in user's timezone using Intl API
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const currentHours = Number(parts.find(p => p.type === 'hour')?.value);
    const currentMinutes = Number(parts.find(p => p.type === 'minute')?.value);

    // Check if current time matches scheduled time (within 1 minute window)
    // Allow 1 minute before and up to the scheduled minute
    const scheduledTotalMinutes = scheduledHours * 60 + scheduledMinutes;
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const diffMinutes = Math.abs(scheduledTotalMinutes - currentTotalMinutes);

    return diffMinutes <= 1; // Within 1 minute window
  } catch (error) {
    return false;
  }
}

/**
 * Check if last_sent was today
 */
function isSentToday(lastSent: Date | null): boolean {
  if (!lastSent) return false;

  const today = new Date();
  const sentDate = new Date(lastSent);

  return (
    sentDate.getFullYear() === today.getFullYear() &&
    sentDate.getMonth() === today.getMonth() &&
    sentDate.getDate() === today.getDate()
  );
}

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/notifications/schedule - Get user's notification schedule
  fastify.get('/api/notifications/schedule', {
    schema: {
      description: 'Get user notification schedule (requires authentication)',
      tags: ['notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            notification_type: { type: 'string' },
            scheduled_time: { type: 'string', description: 'Time in HH:MM format' },
            timezone: { type: 'string' },
            is_active: { type: 'boolean' },
            last_sent: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
        404: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Notification schedule requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    app.logger.info({ userId }, 'Retrieving notification schedule for user');

    const schedule = await app.db.query.notification_schedules.findFirst({
      where: eq(schema.notification_schedules.user_id, userId),
    });

    if (!schedule) {
      app.logger.warn({ userId }, 'No notification schedule found for user');
      return reply.code(404).send({ error: 'No notification schedule found' });
    }

    app.logger.info({ userId, scheduleId: schedule.id }, 'Notification schedule retrieved');

    return reply.code(200).send({
      id: schedule.id,
      notification_type: schedule.notification_type,
      scheduled_time: schedule.scheduled_time,
      timezone: schedule.timezone,
      is_active: schedule.is_active,
      last_sent: schedule.last_sent ? schedule.last_sent.toISOString() : null,
    });
  });

  // GET /api/notifications/check-due - Check if a notification is due right now
  fastify.get('/api/notifications/check-due', {
    schema: {
      description: 'Check if daily sea time review notification is due (requires authentication)',
      tags: ['notifications'],
      response: {
        200: {
          type: 'object',
          properties: {
            isDue: { type: 'boolean', description: 'Whether notification is due right now' },
            lastSent: { type: ['string', 'null'], format: 'date-time' },
            scheduleId: { type: ['string', 'null'] },
            pendingEntriesCount: { type: 'number', description: 'Number of pending sea time entries' },
          },
        },
        401: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const userId = await extractUserIdFromRequest(request, app);
    if (!userId) {
      app.logger.warn({}, 'Notification check requested without authentication');
      return reply.code(401).send({ error: 'Authentication required' });
    }

    try {
      // Get notification schedule
      const schedule = await app.db.query.notification_schedules.findFirst({
        where: eq(schema.notification_schedules.user_id, userId),
      });

      if (!schedule || !schedule.is_active) {
        app.logger.debug({ userId }, 'No active notification schedule found');
        return reply.code(200).send({
          isDue: false,
          lastSent: null,
          scheduleId: null,
          pendingEntriesCount: 0,
        });
      }

      // Check if time matches
      const isTimeMatch = isTimeNowInTimezone(schedule.scheduled_time, schedule.timezone);
      const alreadySentToday = isSentToday(schedule.last_sent);

      // Get count of pending entries
      const pendingEntries = await app.db.query.sea_time_entries.findMany({
        where: and(
          eq(schema.sea_time_entries.user_id, userId),
          eq(schema.sea_time_entries.status, 'pending')
        ),
      });

      const isDue = isTimeMatch && !alreadySentToday && pendingEntries.length > 0;

      app.logger.debug(
        {
          userId,
          scheduleId: schedule.id,
          timeMatch: isTimeMatch,
          sentToday: alreadySentToday,
          pendingCount: pendingEntries.length,
          isDue,
        },
        'Notification check completed'
      );

      return reply.code(200).send({
        isDue,
        lastSent: schedule.last_sent ? schedule.last_sent.toISOString() : null,
        scheduleId: schedule.id,
        pendingEntriesCount: pendingEntries.length,
      });
    } catch (error) {
      app.logger.error({ err: error, userId }, 'Error checking notification status');
      return reply.code(200).send({
        isDue: false,
        lastSent: null,
        scheduleId: null,
        pendingEntriesCount: 0,
      });
    }
  });

  // PUT /api/notifications/schedule - Update notification schedule
  fastify.put<{ Body: { scheduled_time?: string; timezone?: string; is_active?: boolean } }>(
    '/api/notifications/schedule',
    {
      schema: {
        description: 'Update user notification schedule (requires authentication)',
        tags: ['notifications'],
        body: {
          type: 'object',
          properties: {
            scheduled_time: { type: 'string', description: 'Time in HH:MM format (e.g., "18:00")' },
            timezone: { type: 'string', description: 'Timezone (e.g., "Europe/London")' },
            is_active: { type: 'boolean', description: 'Enable/disable notifications' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              notification_type: { type: 'string' },
              scheduled_time: { type: 'string' },
              timezone: { type: 'string' },
              is_active: { type: 'boolean' },
              last_sent: { type: ['string', 'null'], format: 'date-time' },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          401: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const userId = await extractUserIdFromRequest(request, app);
      if (!userId) {
        app.logger.warn({}, 'Notification schedule update requested without authentication');
        return reply.code(401).send({ error: 'Authentication required' });
      }

      const { scheduled_time, timezone, is_active } = request.body;

      // Validate scheduled_time format if provided
      if (scheduled_time && !/^\d{2}:\d{2}$/.test(scheduled_time)) {
        app.logger.warn({ userId, scheduled_time }, 'Invalid scheduled_time format');
        return reply.code(400).send({ error: 'Invalid scheduled_time format. Use HH:MM (24-hour format)' });
      }

      // Validate timezone if provided
      if (timezone) {
        try {
          // Test if timezone is valid by using it
          new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        } catch (error) {
          app.logger.warn({ userId, timezone }, 'Invalid timezone provided');
          return reply.code(400).send({ error: 'Invalid timezone' });
        }
      }

      app.logger.info({ userId, scheduled_time, timezone, is_active }, 'Updating notification schedule');

      // Find existing schedule
      const existing = await app.db.query.notification_schedules.findFirst({
        where: eq(schema.notification_schedules.user_id, userId),
      });

      if (!existing) {
        app.logger.warn({ userId }, 'No notification schedule found for user');
        return reply.code(404).send({ error: 'No notification schedule found' });
      }

      // Update schedule
      const updateData: any = {};
      if (scheduled_time) updateData.scheduled_time = scheduled_time;
      if (timezone) updateData.timezone = timezone;
      if (is_active !== undefined) updateData.is_active = is_active;
      updateData.updated_at = new Date();

      const [updated] = await app.db
        .update(schema.notification_schedules)
        .set(updateData)
        .where(eq(schema.notification_schedules.id, existing.id))
        .returning();

      app.logger.info(
        { userId, scheduleId: existing.id, updated: updateData },
        'Notification schedule updated'
      );

      return reply.code(200).send({
        id: updated.id,
        notification_type: updated.notification_type,
        scheduled_time: updated.scheduled_time,
        timezone: updated.timezone,
        is_active: updated.is_active,
        last_sent: updated.last_sent ? updated.last_sent.toISOString() : null,
      });
    }
  );
}

/**
 * Scheduler service for checking due notifications
 * Runs every minute to find notifications that need to be sent
 */
export async function processNotificationSchedules(app: App): Promise<void> {
  try {
    app.logger.debug({}, 'Checking for due notifications');

    // Get all active notification schedules
    const schedules = await app.db.query.notification_schedules.findMany({
      where: eq(schema.notification_schedules.is_active, true),
    });

    app.logger.debug({ schedulesCount: schedules.length }, `Found ${schedules.length} active notification schedules`);

    for (const schedule of schedules) {
      // Check if current time matches scheduled time in user's timezone
      if (!isTimeNowInTimezone(schedule.scheduled_time, schedule.timezone)) {
        continue;
      }

      // Check if already sent today
      if (isSentToday(schedule.last_sent)) {
        app.logger.debug(
          { userId: schedule.user_id, scheduleId: schedule.id },
          'Notification already sent today, skipping'
        );
        continue;
      }

      // Handle different notification types
      if (schedule.notification_type === 'daily_sea_time_review') {
        await handleDailySeaTimeReviewNotification(app, schedule);
      }
    }
  } catch (error) {
    app.logger.error({ err: error }, 'Error processing notification schedules');
  }
}

/**
 * Handle daily sea time review notification
 */
async function handleDailySeaTimeReviewNotification(
  app: App,
  schedule: typeof schema.notification_schedules.$inferSelect
): Promise<void> {
  const userId = schedule.user_id;

  try {
    app.logger.info({ userId, scheduleId: schedule.id }, 'Processing daily sea time review notification');

    // Check if user has pending sea time entries
    const pendingEntries = await app.db.query.sea_time_entries.findMany({
      where: and(
        eq(schema.sea_time_entries.user_id, userId),
        eq(schema.sea_time_entries.status, 'pending')
      ),
    });

    if (pendingEntries.length === 0) {
      app.logger.debug(
        { userId, scheduleId: schedule.id },
        'No pending sea time entries, skipping notification'
      );
      return;
    }

    // Update last_sent timestamp
    const [updated] = await app.db
      .update(schema.notification_schedules)
      .set({ last_sent: new Date() })
      .where(eq(schema.notification_schedules.id, schedule.id))
      .returning();

    app.logger.info(
      {
        userId,
        scheduleId: schedule.id,
        pendingCount: pendingEntries.length,
        lastSent: updated.last_sent?.toISOString(),
      },
      `Daily sea time review notification sent: ${pendingEntries.length} pending entries`
    );

    // Note: Actual notification delivery is handled by the frontend using this backend state
    // The frontend can query /api/sea-time/pending to get the pending entries and display notifications
  } catch (error) {
    app.logger.error(
      { err: error, userId, scheduleId: schedule.id },
      'Error sending daily sea time review notification'
    );
  }
}

/**
 * Helper function to create or update default notification schedule for a user
 * Called on first login
 */
export async function ensureUserNotificationSchedule(app: App, userId: string): Promise<void> {
  try {
    // Check if user already has a notification schedule
    const existing = await app.db.query.notification_schedules.findFirst({
      where: eq(schema.notification_schedules.user_id, userId),
    });

    if (existing) {
      app.logger.debug({ userId }, 'User already has notification schedule');
      return;
    }

    // Create default notification schedule
    const [created] = await app.db
      .insert(schema.notification_schedules)
      .values({
        user_id: userId,
        notification_type: 'daily_sea_time_review',
        scheduled_time: '18:00',
        timezone: 'UTC',
        is_active: true,
      })
      .returning();

    app.logger.info(
      { userId, scheduleId: created.id },
      'Default notification schedule created for user'
    );
  } catch (error) {
    app.logger.error({ err: error, userId }, 'Error creating default notification schedule');
  }
}

// Helper function to create a notification for sea time entry (compatibility)
export async function createSeaTimeEntryNotification(
  app: App,
  userId: string,
  seaTimeEntryId: string,
  vesselName: string,
  durationHours: string | null
): Promise<void> {
  app.logger.debug(
    { userId, seaTimeEntryId, vesselName, durationHours },
    'Sea time entry created (notification triggered via daily review schedule)'
  );
}
