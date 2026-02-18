import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import * as authSchema from "../db/auth-schema.js";
import * as schema from "../db/schema.js";
import type { App } from "../index.js";

export function register(app: App, fastify: FastifyInstance) {
  // GET /api/admin/verify-sea-time - Check sea time entries for a specific user and vessel
  fastify.get<{ Querystring: { email: string; mmsi: string } }>(
    '/api/admin/verify-sea-time',
    {
      schema: {
        description: 'Admin endpoint to verify sea time entries for a user and vessel',
        tags: ['admin'],
        querystring: {
          type: 'object',
          required: ['email', 'mmsi'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email' },
            mmsi: { type: 'string', description: 'Vessel MMSI' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                },
              },
              vessel: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  is_active: { type: 'boolean' },
                },
              },
              seaTimeEntries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    start_time: { type: 'string', format: 'date-time' },
                    end_time: { type: ['string', 'null'], format: 'date-time' },
                    sea_days: { type: ['number', 'null'] },
                    status: { type: 'string', enum: ['pending', 'confirmed', 'rejected'] },
                    notes: { type: ['string', 'null'] },
                    created_at: { type: 'string', format: 'date-time' },
                    start_latitude: { type: ['number', 'null'] },
                    start_longitude: { type: ['number', 'null'] },
                    end_latitude: { type: ['number', 'null'] },
                    end_longitude: { type: ['number', 'null'] },
                  },
                },
              },
              summary: {
                type: 'object',
                properties: {
                  totalEntries: { type: 'number' },
                  pendingEntries: { type: 'number' },
                  confirmedEntries: { type: 'number' },
                  rejectedEntries: { type: 'number' },
                  totalConfirmedSeaDays: { type: 'number' },
                },
              },
            },
          },
          404: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, mmsi } = request.query;

      app.logger.info({ email, mmsi }, 'Admin verify sea time request');

      try {
        // Step 1: Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found');
          return reply.code(404).send({
            error: `User with email ${email} not found`,
          });
        }

        const user = users[0];
        app.logger.debug({ userId: user.id, email }, 'User found');

        // Step 2: Find vessel by MMSI and user_id
        const vessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.mmsi, mmsi));

        let vessel: (typeof schema.vessels.$inferSelect) | null = null;

        // Filter vessels by user_id if provided
        const userVessels = vessels.filter(v => v.user_id === user.id);
        if (userVessels.length > 0) {
          vessel = userVessels[0];
          app.logger.debug({ userId: user.id, vesselId: vessel.id, mmsi }, 'Vessel found');
        } else {
          app.logger.debug({ userId: user.id, mmsi }, 'Vessel not found for user');
        }

        // Step 3: Get sea time entries for the vessel
        let seaTimeEntries: Array<typeof schema.sea_time_entries.$inferSelect> = [];
        if (vessel) {
          seaTimeEntries = await app.db
            .select()
            .from(schema.sea_time_entries)
            .where(eq(schema.sea_time_entries.vessel_id, vessel.id));

          app.logger.debug({ vesselId: vessel.id, entryCount: seaTimeEntries.length }, 'Sea time entries retrieved');
        }

        // Step 4: Calculate summary statistics
        const summary = {
          totalEntries: seaTimeEntries.length,
          pendingEntries: seaTimeEntries.filter(e => e.status === 'pending').length,
          confirmedEntries: seaTimeEntries.filter(e => e.status === 'confirmed').length,
          rejectedEntries: seaTimeEntries.filter(e => e.status === 'rejected').length,
          totalConfirmedSeaDays: seaTimeEntries
            .filter(e => e.status === 'confirmed' && e.sea_days)
            .reduce((sum, e) => sum + (e.sea_days || 0), 0),
        };

        app.logger.info(
          { userId: user.id, vesselId: vessel?.id, summary },
          'Sea time verification complete'
        );

        return reply.code(200).send({
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
          },
          vessel: vessel
            ? {
                id: vessel.id,
                mmsi: vessel.mmsi,
                vessel_name: vessel.vessel_name,
                is_active: vessel.is_active,
              }
            : null,
          seaTimeEntries: seaTimeEntries.map(e => ({
            id: e.id,
            start_time: e.start_time.toISOString(),
            end_time: e.end_time ? e.end_time.toISOString() : null,
            sea_days: e.sea_days,
            status: e.status,
            notes: e.notes,
            created_at: e.created_at.toISOString(),
            start_latitude: e.start_latitude ? parseFloat(e.start_latitude.toString()) : null,
            start_longitude: e.start_longitude ? parseFloat(e.start_longitude.toString()) : null,
            end_latitude: e.end_latitude ? parseFloat(e.end_latitude.toString()) : null,
            end_longitude: e.end_longitude ? parseFloat(e.end_longitude.toString()) : null,
          })),
          summary,
        });
      } catch (error) {
        app.logger.error({ err: error, email, mmsi }, 'Error verifying sea time');
        return reply.code(500).send({
          error: 'Failed to verify sea time entries',
        });
      }
    }
  );

  // POST /api/admin/verify-vessel-tasks - Verify and repair scheduled tasks for all active vessels
  fastify.post('/api/admin/verify-vessel-tasks', {
    schema: {
      description: 'Verify that all active vessels have scheduled tracking tasks. Creates missing tasks automatically.',
      tags: ['admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            summary: {
              type: 'object',
              properties: {
                total_active_vessels: { type: 'number' },
                tasks_created: { type: 'number' },
                tasks_reactivated: { type: 'number' },
                tasks_already_active: { type: 'number' },
              },
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vessel_id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  mmsi: { type: 'string' },
                  action: { type: 'string', enum: ['created', 'reactivated', 'already_active'] },
                  error: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            summary: {
              type: 'object',
              properties: {
                total_active_vessels: { type: 'number' },
                tasks_created: { type: 'number' },
                tasks_reactivated: { type: 'number' },
                tasks_already_active: { type: 'number' },
              },
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  vessel_id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  mmsi: { type: 'string' },
                  action: { type: 'string', enum: ['created', 'reactivated', 'already_active'] },
                  error: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    app.logger.info({}, 'Starting vessel tracking task verification and repair');

    const summary = {
      total_active_vessels: 0,
      tasks_created: 0,
      tasks_reactivated: 0,
      tasks_already_active: 0,
    };

    const details: Array<{
      vessel_id: string;
      vessel_name: string;
      mmsi: string;
      action: 'created' | 'reactivated' | 'already_active';
      error?: string;
    }> = [];

    try {
      // Get all active vessels
      const activeVessels = await app.db
        .select()
        .from(schema.vessels)
        .where(eq(schema.vessels.is_active, true));

      app.logger.info({ count: activeVessels.length }, 'Found active vessels to verify');

      summary.total_active_vessels = activeVessels.length;

      // Process each active vessel
      for (const vessel of activeVessels) {
        try {
          // Check if a scheduled task exists for this vessel
          const existingTasks = await app.db
            .select()
            .from(schema.scheduled_tasks)
            .where(eq(schema.scheduled_tasks.vessel_id, vessel.id));

          if (existingTasks.length === 0) {
            // No task exists - create one
            const now = new Date();
            const [newTask] = await app.db
              .insert(schema.scheduled_tasks)
              .values({
                user_id: vessel.user_id,
                task_type: 'vessel_tracking',
                vessel_id: vessel.id,
                interval_hours: '2',
                is_active: true,
                next_run: now,
                last_run: null,
              })
              .returning();

            app.logger.info(
              { vessel_id: vessel.id, vessel_name: vessel.vessel_name, mmsi: vessel.mmsi, task_id: newTask.id, interval: '2 hours' },
              'Created missing tracking task for vessel with 2-hour position check interval'
            );

            summary.tasks_created++;
            details.push({
              vessel_id: vessel.id,
              vessel_name: vessel.vessel_name,
              mmsi: vessel.mmsi,
              action: 'created',
            });
          } else {
            const existingTask = existingTasks[0];

            if (!existingTask.is_active) {
              // Task exists but is inactive - reactivate it
              await app.db
                .update(schema.scheduled_tasks)
                .set({ is_active: true })
                .where(eq(schema.scheduled_tasks.id, existingTask.id));

              app.logger.info(
                { vessel_id: vessel.id, vessel_name: vessel.vessel_name, mmsi: vessel.mmsi, task_id: existingTask.id },
                'Reactivated tracking task for vessel'
              );

              summary.tasks_reactivated++;
              details.push({
                vessel_id: vessel.id,
                vessel_name: vessel.vessel_name,
                mmsi: vessel.mmsi,
                action: 'reactivated',
              });
            } else {
              // Task exists and is active - no action needed
              app.logger.debug(
                { vessel_id: vessel.id, vessel_name: vessel.vessel_name, mmsi: vessel.mmsi, task_id: existingTask.id },
                'Tracking task already active for vessel'
              );

              summary.tasks_already_active++;
              details.push({
                vessel_id: vessel.id,
                vessel_name: vessel.vessel_name,
                mmsi: vessel.mmsi,
                action: 'already_active',
              });
            }
          }
        } catch (error) {
          app.logger.error(
            { err: error, vessel_id: vessel.id, vessel_name: vessel.vessel_name, mmsi: vessel.mmsi },
            'Failed to verify/repair task for vessel'
          );

          details.push({
            vessel_id: vessel.id,
            vessel_name: vessel.vessel_name,
            mmsi: vessel.mmsi,
            action: 'created',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      app.logger.info(
        {
          total_active_vessels: summary.total_active_vessels,
          tasks_created: summary.tasks_created,
          tasks_reactivated: summary.tasks_reactivated,
          tasks_already_active: summary.tasks_already_active,
        },
        'Vessel tracking task verification and repair completed'
      );

      return reply.code(200).send({
        success: true,
        summary,
        details,
      });
    } catch (error) {
      app.logger.error({ err: error }, 'Error during vessel tracking task verification');
      return reply.code(500).send({
        success: false,
        error: 'Failed to verify vessel tracking tasks',
        summary,
        details,
      });
    }
  });

  // GET /api/admin/vessel-status/:mmsi - Diagnostic endpoint for vessel sea time detection status
  fastify.get<{ Params: { mmsi: string } }>('/api/admin/vessel-status/:mmsi', {
    schema: {
      description: 'Get detailed diagnostic information about a vessel\'s sea time detection status',
      tags: ['admin'],
      params: {
        type: 'object',
        required: ['mmsi'],
        properties: { mmsi: { type: 'string' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            vessel: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                mmsi: { type: 'string' },
                vessel_name: { type: 'string' },
                is_active: { type: 'boolean' },
                user_id: { type: ['string', 'null'] },
              },
            },
            scheduled_task: {
              type: ['object', 'null'],
              properties: {
                id: { type: 'string' },
                is_active: { type: 'boolean' },
                last_run: { type: ['string', 'null'], format: 'date-time' },
                next_run: { type: 'string', format: 'date-time' },
                interval_hours: { type: 'string' },
              },
            },
            ais_checks_last_24h: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  check_time: { type: 'string', format: 'date-time' },
                  is_moving: { type: 'boolean' },
                  speed_knots: { type: ['number', 'null'] },
                  latitude: { type: ['number', 'null'] },
                  longitude: { type: ['number', 'null'] },
                  time_since_previous_hours: { type: ['number', 'null'] },
                  position_change_degrees: { type: ['number', 'null'] },
                },
              },
            },
            movement_analysis: {
              type: 'object',
              properties: {
                total_checks: { type: 'number' },
                movement_windows: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      start_time: { type: 'string', format: 'date-time' },
                      end_time: { type: 'string', format: 'date-time' },
                      duration_hours: { type: 'number' },
                      position_change: { type: 'number' },
                      movement_detected: { type: 'boolean' },
                    },
                  },
                },
                total_underway_hours: { type: 'number' },
                meets_mca_threshold: { type: 'boolean' },
              },
            },
            sea_time_entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  start_time: { type: 'string', format: 'date-time' },
                  end_time: { type: ['string', 'null'], format: 'date-time' },
                  duration_hours: { type: ['number', 'null'] },
                  status: { type: 'string' },
                  mca_compliant: { type: ['boolean', 'null'] },
                  detection_window_hours: { type: ['number', 'null'] },
                },
              },
            },
            entry_creation_status: {
              type: 'object',
              properties: {
                should_create_entry: { type: 'boolean' },
                reason: { type: 'string' },
                calendar_day_check: {
                  type: 'object',
                  properties: {
                    today: { type: 'string' },
                    has_existing_entry: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
        404: { type: 'object', properties: { error: { type: 'string' } } },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    const { mmsi } = request.params;

    app.logger.info({ mmsi }, 'Checking vessel status for diagnostic');

    try {
      // 1. Find vessel by MMSI
      const vessels = await app.db
        .select()
        .from(schema.vessels)
        .where(eq(schema.vessels.mmsi, mmsi));

      if (vessels.length === 0) {
        app.logger.warn({ mmsi }, 'Vessel not found');
        return reply.code(404).send({ error: `Vessel with MMSI ${mmsi} not found` });
      }

      const vessel = vessels[0];
      app.logger.debug({ vesselId: vessel.id, mmsi }, 'Vessel found');

      // 2. Find scheduled task for this vessel
      const scheduledTasks = await app.db
        .select()
        .from(schema.scheduled_tasks)
        .where(eq(schema.scheduled_tasks.vessel_id, vessel.id));

      const scheduledTask = scheduledTasks.length > 0 ? scheduledTasks[0] : null;

      // 3. Get all AIS checks in the last 24 hours
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const aisChecks = await app.db
        .select()
        .from(schema.ais_checks)
        .where(eq(schema.ais_checks.vessel_id, vessel.id))
        .then(checks => checks.filter(c => new Date(c.check_time) >= twentyFourHoursAgo))
        .then(checks => checks.sort((a, b) => new Date(a.check_time).getTime() - new Date(b.check_time).getTime()));

      // 4. Analyze AIS checks for movement patterns
      const aisChecksWithAnalysis = aisChecks.map((check, index) => {
        let timeSincePrevious: number | null = null;
        let positionChange: number | null = null;

        if (index > 0) {
          const prevCheck = aisChecks[index - 1];
          const timeDiff = new Date(check.check_time).getTime() - new Date(prevCheck.check_time).getTime();
          timeSincePrevious = Math.round((timeDiff / (1000 * 60 * 60)) * 100) / 100;

          // Calculate position change if both checks have coordinates
          if (
            prevCheck.latitude &&
            prevCheck.longitude &&
            check.latitude &&
            check.longitude
          ) {
            const lat1 = parseFloat(prevCheck.latitude.toString());
            const lon1 = parseFloat(prevCheck.longitude.toString());
            const lat2 = parseFloat(check.latitude.toString());
            const lon2 = parseFloat(check.longitude.toString());

            // Simple degree distance (not geodesic)
            positionChange = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lon2 - lon1, 2));
            positionChange = Math.round(positionChange * 10000) / 10000;
          }
        }

        return {
          check_time: check.check_time.toISOString(),
          is_moving: check.is_moving,
          speed_knots: check.speed_knots ? parseFloat(check.speed_knots.toString()) : null,
          latitude: check.latitude ? parseFloat(check.latitude.toString()) : null,
          longitude: check.longitude ? parseFloat(check.longitude.toString()) : null,
          time_since_previous_hours: timeSincePrevious,
          position_change_degrees: positionChange,
        };
      });

      // 5. Detect movement windows (consecutive checks with movement > 0.1 degrees)
      const movementWindows: Array<{
        start_time: string;
        end_time: string;
        duration_hours: number;
        position_change: number;
        movement_detected: boolean;
      }> = [];

      for (let i = 1; i < aisChecksWithAnalysis.length; i++) {
        const currentCheck = aisChecksWithAnalysis[i];
        if (currentCheck.position_change_degrees && currentCheck.position_change_degrees > 0.1) {
          const prevCheck = aisChecksWithAnalysis[i - 1];
          const startTime = new Date(prevCheck.check_time);
          const endTime = new Date(currentCheck.check_time);
          const durationMs = endTime.getTime() - startTime.getTime();
          const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

          movementWindows.push({
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            duration_hours: durationHours,
            position_change: currentCheck.position_change_degrees,
            movement_detected: true,
          });
        }
      }

      // 6. Calculate total underway hours from movement windows
      const totalUnderwayHours = movementWindows.length > 0
        ? movementWindows.reduce((sum, window) => sum + window.duration_hours, 0)
        : 0;

      const meetsMcaThreshold = totalUnderwayHours >= 4;

      // 7. Get sea time entries for this vessel
      const seaTimeEntries = await app.db
        .select()
        .from(schema.sea_time_entries)
        .where(eq(schema.sea_time_entries.vessel_id, vessel.id))
        .then(entries => entries.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()));

      const seaTimeEntriesFormatted = seaTimeEntries.map(entry => {
        let durationHours = null;
        if (entry.start_time && entry.end_time) {
          const startTime = new Date(entry.start_time);
          const endTime = new Date(entry.end_time);
          const diffMs = endTime.getTime() - startTime.getTime();
          durationHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
        }

        return {
          id: entry.id,
          start_time: entry.start_time.toISOString(),
          end_time: entry.end_time ? entry.end_time.toISOString() : null,
          duration_hours: durationHours,
          status: entry.status,
          mca_compliant: entry.mca_compliant,
          detection_window_hours: entry.detection_window_hours ? parseFloat(entry.detection_window_hours.toString()) : null,
        };
      });

      // 8. Check if entry already exists for today
      const today = new Date().toISOString().split('T')[0];
      const todayEntries = seaTimeEntries.filter(entry => {
        const entryDay = new Date(entry.start_time).toISOString().split('T')[0];
        return entryDay === today;
      });

      const hasExistingEntryToday = todayEntries.length > 0;

      // 9. Determine entry creation status
      let shouldCreateEntry = false;
      let reason = '';

      if (!meetsMcaThreshold) {
        reason = `Insufficient underway hours: ${Math.round(totalUnderwayHours * 100) / 100}h detected (need 4h+ for MCA compliance)`;
      } else if (hasExistingEntryToday) {
        reason = `Entry already exists for today (${todayEntries.length} existing)`;
      } else {
        shouldCreateEntry = true;
        reason = 'Meets all criteria for automatic sea time entry creation';
      }

      app.logger.info(
        {
          vesselId: vessel.id,
          mmsi,
          totalUnderwayHours: Math.round(totalUnderwayHours * 100) / 100,
          meetsMcaThreshold,
          hasExistingEntryToday,
          shouldCreateEntry,
        },
        'Vessel diagnostic analysis complete'
      );

      return reply.code(200).send({
        vessel: {
          id: vessel.id,
          mmsi: vessel.mmsi,
          vessel_name: vessel.vessel_name,
          is_active: vessel.is_active,
          user_id: vessel.user_id,
        },
        scheduled_task: scheduledTask
          ? {
              id: scheduledTask.id,
              is_active: scheduledTask.is_active,
              last_run: scheduledTask.last_run ? scheduledTask.last_run.toISOString() : null,
              next_run: scheduledTask.next_run.toISOString(),
              interval_hours: scheduledTask.interval_hours,
            }
          : null,
        ais_checks_last_24h: aisChecksWithAnalysis,
        movement_analysis: {
          total_checks: aisChecksWithAnalysis.length,
          movement_windows: movementWindows,
          total_underway_hours: Math.round(totalUnderwayHours * 100) / 100,
          meets_mca_threshold: meetsMcaThreshold,
        },
        sea_time_entries: seaTimeEntriesFormatted,
        entry_creation_status: {
          should_create_entry: shouldCreateEntry,
          reason,
          calendar_day_check: {
            today,
            has_existing_entry: hasExistingEntryToday,
          },
        },
      });
    } catch (error) {
      app.logger.error({ err: error, mmsi }, 'Error checking vessel status');
      return reply.code(500).send({ error: 'Failed to retrieve vessel status' });
    }
  });

  // GET /api/admin/scheduled-tasks-status - Get status of all scheduled tasks
  fastify.get('/api/admin/scheduled-tasks-status', {
    schema: {
      description: 'Get status of all scheduled AIS check tasks to verify deployment',
      tags: ['admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                total_tasks: { type: 'number' },
                active_tasks: { type: 'number' },
                inactive_tasks: { type: 'number' },
              },
            },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  mmsi: { type: 'string' },
                  interval_hours: { type: 'string' },
                  is_active: { type: 'boolean' },
                  last_run: { type: ['string', 'null'], format: 'date-time' },
                  next_run: { type: 'string', format: 'date-time' },
                },
              },
            },
            next_scheduled_run: { type: ['string', 'null'], format: 'date-time' },
            current_time: { type: 'string', format: 'date-time' },
          },
        },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    app.logger.info({}, 'Retrieving scheduled tasks status');

    try {
      // Get all scheduled tasks with vessel information
      const tasks = await app.db
        .select({
          task: schema.scheduled_tasks,
          vessel: schema.vessels,
        })
        .from(schema.scheduled_tasks)
        .leftJoin(schema.vessels, eq(schema.vessels.id, schema.scheduled_tasks.vessel_id))
        .orderBy(schema.scheduled_tasks.next_run);

      // Format task information
      const formattedTasks = tasks.map(({ task, vessel }) => ({
        id: task.id,
        vessel_name: vessel ? vessel.vessel_name : 'Unknown',
        mmsi: vessel ? vessel.mmsi : 'N/A',
        interval_hours: task.interval_hours,
        is_active: task.is_active,
        last_run: task.last_run ? task.last_run.toISOString() : null,
        next_run: task.next_run.toISOString(),
      }));

      // Calculate summary statistics
      const totalTasks = formattedTasks.length;
      const activeTasks = formattedTasks.filter(t => t.is_active).length;
      const inactiveTasks = totalTasks - activeTasks;

      // Find next scheduled run time
      const nextRun = formattedTasks.length > 0 ? formattedTasks[0].next_run : null;

      const now = new Date();

      app.logger.info(
        {
          totalTasks,
          activeTasks,
          inactiveTasks,
          nextRun,
        },
        'Scheduled tasks status retrieved'
      );

      return reply.code(200).send({
        summary: {
          total_tasks: totalTasks,
          active_tasks: activeTasks,
          inactive_tasks: inactiveTasks,
        },
        tasks: formattedTasks,
        next_scheduled_run: nextRun,
        current_time: now.toISOString(),
      });
    } catch (error) {
      app.logger.error({ err: error }, 'Error retrieving scheduled tasks status');
      return reply.code(500).send({ error: 'Failed to retrieve scheduled tasks status' });
    }
  });

  // GET /api/admin/scheduler-status - Diagnostic endpoint for scheduler status and AIS checks
  fastify.get('/api/admin/scheduler-status', {
    schema: {
      description: 'Diagnostic endpoint for scheduler status and recent AIS checks',
      tags: ['admin'],
      response: {
        200: {
          type: 'object',
          properties: {
            current_time: { type: 'string', format: 'date-time' },
            scheduler_info: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                next_check_interval_minutes: { type: 'number' },
              },
            },
            scheduled_tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  mmsi: { type: 'string' },
                  task_type: { type: 'string' },
                  interval_hours: { type: 'string' },
                  is_active: { type: 'boolean' },
                  last_run: { type: ['string', 'null'], format: 'date-time' },
                  next_run: { type: 'string', format: 'date-time' },
                  vessel_is_active: { type: 'boolean' },
                },
              },
            },
            recent_ais_checks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  mmsi: { type: 'string' },
                  check_time: { type: 'string', format: 'date-time' },
                  is_moving: { type: 'boolean' },
                  speed_knots: { type: ['number', 'null'] },
                  latitude: { type: ['number', 'null'] },
                  longitude: { type: ['number', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                total_scheduled_tasks: { type: 'number' },
                active_tasks: { type: 'number' },
                due_tasks: { type: 'number' },
                total_ais_checks_all_time: { type: 'number' },
                recent_ais_checks_count: { type: 'number' },
              },
            },
          },
        },
        500: { type: 'object', properties: { error: { type: 'string' } } },
      },
    },
  }, async (request, reply) => {
    app.logger.info({}, 'Retrieving scheduler diagnostic status');

    try {
      const now = new Date();

      // Get all scheduled tasks with vessel information
      const allTasks = await app.db
        .select({
          task: schema.scheduled_tasks,
          vessel: schema.vessels,
        })
        .from(schema.scheduled_tasks)
        .leftJoin(schema.vessels, eq(schema.vessels.id, schema.scheduled_tasks.vessel_id));

      // Find due tasks (same query as scheduler uses)
      const dueTasks = allTasks.filter(({ task, vessel }) =>
        task.task_type === 'ais_check' &&
        task.is_active === true &&
        vessel &&
        vessel.is_active === true &&
        task.next_run <= now
      );

      // Format task information
      const formattedTasks = allTasks.map(({ task, vessel }) => ({
        id: task.id,
        vessel_name: vessel ? vessel.vessel_name : 'Unknown',
        mmsi: vessel ? vessel.mmsi : 'N/A',
        task_type: task.task_type,
        interval_hours: task.interval_hours,
        is_active: task.is_active,
        last_run: task.last_run ? task.last_run.toISOString() : null,
        next_run: task.next_run.toISOString(),
        vessel_is_active: vessel ? vessel.is_active : false,
      }));

      // Get last 10 AIS checks across all vessels
      const recentAisChecks = await app.db
        .select({
          check: schema.ais_checks,
          vessel: schema.vessels,
        })
        .from(schema.ais_checks)
        .leftJoin(schema.vessels, eq(schema.vessels.id, schema.ais_checks.vessel_id))
        .orderBy(schema.ais_checks.check_time)
        .then(results => results.reverse().slice(0, 10));

      // Format AIS checks
      const formattedAisChecks = recentAisChecks.map(({ check, vessel }) => ({
        id: check.id,
        vessel_name: vessel ? vessel.vessel_name : 'Unknown',
        mmsi: vessel ? vessel.mmsi : 'N/A',
        check_time: check.check_time.toISOString(),
        is_moving: check.is_moving,
        speed_knots: check.speed_knots ? parseFloat(check.speed_knots.toString()) : null,
        latitude: check.latitude ? parseFloat(check.latitude.toString()) : null,
        longitude: check.longitude ? parseFloat(check.longitude.toString()) : null,
        created_at: check.created_at.toISOString(),
      }));

      // Get total AIS checks count
      const totalAisChecksResult = await app.db
        .select({ count: schema.ais_checks.id })
        .from(schema.ais_checks);

      const totalAisChecks = totalAisChecksResult.length > 0 ? parseInt(String(Object.keys(totalAisChecksResult[0])[0])) : 0;

      app.logger.info(
        {
          totalTasks: allTasks.length,
          activeTasks: allTasks.filter(t => t.task.is_active).length,
          dueTasks: dueTasks.length,
          recentAisChecksCount: formattedAisChecks.length,
        },
        'Scheduler diagnostic data retrieved'
      );

      return reply.code(200).send({
        current_time: now.toISOString(),
        scheduler_info: {
          status: 'running',
          next_check_interval_minutes: 1,
        },
        scheduled_tasks: formattedTasks,
        recent_ais_checks: formattedAisChecks,
        summary: {
          total_scheduled_tasks: allTasks.length,
          active_tasks: allTasks.filter(t => t.task.is_active).length,
          due_tasks: dueTasks.length,
          total_ais_checks_all_time: totalAisChecks,
          recent_ais_checks_count: formattedAisChecks.length,
        },
      });
    } catch (error) {
      app.logger.error({ err: error }, 'Error retrieving scheduler diagnostic status');
      return reply.code(500).send({ error: 'Failed to retrieve scheduler diagnostic status' });
    }
  });

  // GET /api/admin/investigate-entry - Investigate a specific sea time entry by user email, vessel name, and timestamp
  fastify.get<{ Querystring: { email: string; vesselName: string; timestamp: string } }>(
    '/api/admin/investigate-entry',
    {
      schema: {
        description: 'Investigate a specific sea time entry to determine its origin and related data',
        tags: ['admin'],
        querystring: {
          type: 'object',
          required: ['email', 'vesselName', 'timestamp'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email (e.g., dan@forelandmarine.com)' },
            vesselName: { type: 'string', description: 'Vessel name (e.g., Brigit)' },
            timestamp: { type: 'string', description: 'ISO timestamp or formatted like "25/01/2026, 22:48:16"' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              entry: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  start_time: { type: 'string', format: 'date-time' },
                  end_time: { type: ['string', 'null'], format: 'date-time' },
                  duration_hours: { type: ['number', 'null'] },
                  status: { type: 'string' },
                  notes: { type: ['string', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                  start_latitude: { type: ['number', 'null'] },
                  start_longitude: { type: ['number', 'null'] },
                  end_latitude: { type: ['number', 'null'] },
                  end_longitude: { type: ['number', 'null'] },
                  service_type: { type: 'string' },
                  mca_compliant: { type: ['boolean', 'null'] },
                  detection_window_hours: { type: ['number', 'null'] },
                  is_stationary: { type: ['boolean', 'null'] },
                },
              },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: ['string', 'null'] },
                  email: { type: 'string' },
                },
              },
              vessel: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  is_active: { type: 'boolean' },
                },
              },
              origin_analysis: {
                type: 'object',
                properties: {
                  entry_source: { type: 'string', enum: ['manual', 'automatic_scheduler', 'unknown'] },
                  evidence: { type: 'string' },
                  related_ais_checks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        check_time: { type: 'string', format: 'date-time' },
                        is_moving: { type: 'boolean' },
                        speed_knots: { type: ['number', 'null'] },
                        latitude: { type: ['number', 'null'] },
                        longitude: { type: ['number', 'null'] },
                        created_at: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                  related_scheduled_tasks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        task_type: { type: 'string' },
                        interval_hours: { type: 'string' },
                        is_active: { type: 'boolean' },
                        last_run: { type: ['string', 'null'], format: 'date-time' },
                        next_run: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                  ais_debug_logs: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        api_url: { type: 'string' },
                        request_time: { type: 'string', format: 'date-time' },
                        response_status: { type: 'string' },
                        error_message: { type: ['string', 'null'] },
                        created_at: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, vesselName, timestamp } = request.query;

      app.logger.info(
        { email, vesselName, timestamp },
        'Investigating sea time entry'
      );

      try {
        // Step 1: Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email.toLowerCase()));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found');
          return reply.code(404).send({ error: `User with email ${email} not found` });
        }

        const user = users[0];

        // Step 2: Find vessel by name (case-insensitive) belonging to that user
        const vessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.user_id, user.id));

        const vessel = vessels.find(v => v.vessel_name.toLowerCase() === vesselName.toLowerCase());

        if (!vessel) {
          app.logger.warn({ userId: user.id, vesselName }, 'Vessel not found for user');
          return reply.code(404).send({ error: `Vessel "${vesselName}" not found for user ${email}` });
        }

        // Step 3: Parse the timestamp query
        let targetTime: Date;
        try {
          // Try parsing as ISO string first
          if (timestamp.includes('T') || timestamp.includes('Z')) {
            targetTime = new Date(timestamp);
          } else {
            // Try parsing as formatted string like "25/01/2026, 22:48:16"
            targetTime = new Date(timestamp);
          }

          if (isNaN(targetTime.getTime())) {
            throw new Error('Invalid date');
          }
        } catch {
          app.logger.warn({ timestamp }, 'Invalid timestamp format');
          return reply.code(400).send({ error: `Invalid timestamp format: ${timestamp}. Use ISO format (2026-01-25T22:48:16Z) or "25/01/2026, 22:48:16"` });
        }

        // Step 4: Find sea time entries matching the timestamp (±1 minute tolerance)
        const toleranceMs = 60 * 1000; // 1 minute
        const minTime = new Date(targetTime.getTime() - toleranceMs);
        const maxTime = new Date(targetTime.getTime() + toleranceMs);

        const allEntries = await app.db
          .select()
          .from(schema.sea_time_entries)
          .where(eq(schema.sea_time_entries.vessel_id, vessel.id));

        const matchingEntries = allEntries.filter(entry => {
          const entryStartTime = new Date(entry.start_time);
          return entryStartTime >= minTime && entryStartTime <= maxTime;
        });

        if (matchingEntries.length === 0) {
          app.logger.warn({ vesselId: vessel.id, targetTime: targetTime.toISOString() }, 'No matching sea time entry found');
          return reply.code(404).send({
            error: `No sea time entry found for vessel "${vesselName}" starting within ±1 minute of ${timestamp}`,
          });
        }

        // Use the closest entry if multiple matches
        const entry = matchingEntries.reduce((closest, current) => {
          const closestDiff = Math.abs(new Date(closest.start_time).getTime() - targetTime.getTime());
          const currentDiff = Math.abs(new Date(current.start_time).getTime() - targetTime.getTime());
          return currentDiff < closestDiff ? current : closest;
        });

        // Step 5: Determine origin by analyzing the entry
        let entrySource: 'manual' | 'automatic_scheduler' | 'unknown' = 'unknown';
        let evidence = '';

        if (entry.notes) {
          const notesLower = entry.notes.toLowerCase();
          if (notesLower.includes('movement detected') && notesLower.includes('nm')) {
            entrySource = 'automatic_scheduler';
            evidence = 'Notes contain "Movement detected" and distance in nautical miles (scheduler signature)';
          } else if (notesLower.includes('movement detected')) {
            entrySource = 'automatic_scheduler';
            evidence = 'Notes contain "Movement detected" pattern (scheduler signature)';
          } else {
            entrySource = 'manual';
            evidence = 'Notes appear to be user-written (no scheduler signature)';
          }
        } else {
          entrySource = 'unknown';
          evidence = 'No notes provided - cannot determine source from notes alone';
        }

        // Step 6: Get related AIS checks around the entry time
        const timeWindowMs = 4 * 60 * 60 * 1000; // 4 hours before and after
        const aisWindowStart = new Date(entry.start_time.getTime() - timeWindowMs);
        const aisWindowEnd = new Date(entry.end_time ? entry.end_time.getTime() + timeWindowMs : entry.start_time.getTime() + timeWindowMs);

        const relatedAisChecks = await app.db
          .select()
          .from(schema.ais_checks)
          .where(eq(schema.ais_checks.vessel_id, vessel.id))
          .then(checks =>
            checks.filter(check => {
              const checkTime = new Date(check.check_time);
              return checkTime >= aisWindowStart && checkTime <= aisWindowEnd;
            })
          );

        // Step 7: Get related scheduled tasks for this vessel
        const relatedScheduledTasks = await app.db
          .select()
          .from(schema.scheduled_tasks)
          .where(eq(schema.scheduled_tasks.vessel_id, vessel.id));

        // Step 8: Get AIS debug logs around the entry time
        const debugWindowStart = new Date(entry.start_time.getTime() - timeWindowMs);
        const debugWindowEnd = new Date(entry.end_time ? entry.end_time.getTime() + timeWindowMs : entry.start_time.getTime() + timeWindowMs);

        const aisDebugLogs = await app.db
          .select()
          .from(schema.ais_debug_logs)
          .where(eq(schema.ais_debug_logs.vessel_id, vessel.id))
          .then(logs =>
            logs.filter(log => {
              const logTime = new Date(log.request_time);
              return logTime >= debugWindowStart && logTime <= debugWindowEnd;
            })
          );

        // Format response
        const entryResponse = {
          id: entry.id,
          vessel_id: entry.vessel_id,
          vessel_name: vessel.vessel_name,
          start_time: entry.start_time.toISOString(),
          end_time: entry.end_time ? entry.end_time.toISOString() : null,
          duration_hours: entry.duration_hours ? parseFloat(String(entry.duration_hours)) : null,
          status: entry.status,
          notes: entry.notes,
          created_at: entry.created_at.toISOString(),
          start_latitude: entry.start_latitude ? parseFloat(String(entry.start_latitude)) : null,
          start_longitude: entry.start_longitude ? parseFloat(String(entry.start_longitude)) : null,
          end_latitude: entry.end_latitude ? parseFloat(String(entry.end_latitude)) : null,
          end_longitude: entry.end_longitude ? parseFloat(String(entry.end_longitude)) : null,
          service_type: entry.service_type,
          mca_compliant: entry.mca_compliant,
          detection_window_hours: entry.detection_window_hours ? parseFloat(String(entry.detection_window_hours)) : null,
          is_stationary: entry.is_stationary,
        };

        const userResponse = {
          id: user.id,
          name: user.name,
          email: user.email,
        };

        const vesselResponse = {
          id: vessel.id,
          mmsi: vessel.mmsi,
          vessel_name: vessel.vessel_name,
          is_active: vessel.is_active,
        };

        const originAnalysisResponse = {
          entry_source: entrySource,
          evidence,
          related_ais_checks: relatedAisChecks.map(check => ({
            id: check.id,
            check_time: check.check_time.toISOString(),
            is_moving: check.is_moving,
            speed_knots: check.speed_knots ? parseFloat(String(check.speed_knots)) : null,
            latitude: check.latitude ? parseFloat(String(check.latitude)) : null,
            longitude: check.longitude ? parseFloat(String(check.longitude)) : null,
            created_at: check.created_at.toISOString(),
          })),
          related_scheduled_tasks: relatedScheduledTasks.map(task => ({
            id: task.id,
            task_type: task.task_type,
            interval_hours: task.interval_hours,
            is_active: task.is_active,
            last_run: task.last_run ? task.last_run.toISOString() : null,
            next_run: task.next_run.toISOString(),
          })),
          ais_debug_logs: aisDebugLogs.map(log => ({
            id: log.id,
            api_url: log.api_url,
            request_time: log.request_time.toISOString(),
            response_status: log.response_status,
            error_message: log.error_message,
            created_at: log.created_at.toISOString(),
          })),
        };

        app.logger.info(
          {
            entryId: entry.id,
            vesselId: vessel.id,
            userId: user.id,
            entrySource,
            relatedAisChecksCount: relatedAisChecks.length,
            scheduledTasksCount: relatedScheduledTasks.length,
            debugLogsCount: aisDebugLogs.length,
          },
          'Sea time entry investigation complete'
        );

        return reply.code(200).send({
          entry: entryResponse,
          user: userResponse,
          vessel: vesselResponse,
          origin_analysis: originAnalysisResponse,
        });
      } catch (error) {
        app.logger.error({ err: error, email, vesselName, timestamp }, 'Error investigating sea time entry');
        return reply.code(500).send({ error: 'Failed to investigate sea time entry' });
      }
    }
  );

  // GET /api/admin/diagnose-vessel-workflow - Diagnostic endpoint for vessel workflow issues
  fastify.get<{ Querystring: { mmsi: string; email: string } }>(
    '/api/admin/diagnose-vessel-workflow',
    {
      schema: {
        description: 'Diagnose vessel workflow and sea time entry creation issues',
        tags: ['admin'],
        querystring: {
          type: 'object',
          required: ['mmsi', 'email'],
          properties: {
            mmsi: { type: 'string', description: 'Vessel MMSI (e.g., 352978169)' },
            email: { type: 'string', format: 'email', description: 'User email (e.g., macnally@me.com)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: ['string', 'null'] },
                },
              },
              vessel: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  mmsi: { type: 'string' },
                  vessel_name: { type: 'string' },
                  is_active: { type: 'boolean' },
                  user_id: { type: ['string', 'null'] },
                },
              },
              scheduled_task: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string' },
                  task_type: { type: 'string' },
                  interval_hours: { type: 'string' },
                  is_active: { type: 'boolean' },
                  last_run: { type: ['string', 'null'], format: 'date-time' },
                  next_run: { type: 'string', format: 'date-time' },
                },
              },
              recent_ais_checks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    check_time: { type: 'string', format: 'date-time' },
                    is_moving: { type: 'boolean' },
                    speed_knots: { type: ['number', 'null'] },
                    latitude: { type: ['number', 'null'] },
                    longitude: { type: ['number', 'null'] },
                  },
                },
              },
              sea_time_entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    start_time: { type: 'string', format: 'date-time' },
                    end_time: { type: ['string', 'null'], format: 'date-time' },
                    duration_hours: { type: ['number', 'null'] },
                    status: { type: 'string' },
                  },
                },
              },
              workflow_status: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['OK', 'ISSUES_FOUND'] },
                  issues: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { mmsi, email } = request.query;

      app.logger.info({ mmsi, email }, 'Diagnosing vessel workflow');

      try {
        // Step 1: Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email.toLowerCase()));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found for diagnosis');
          return reply.code(404).send({ error: `User with email ${email} not found` });
        }

        const user = users[0];

        // Step 2: Find vessel by MMSI
        const vessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.mmsi, mmsi));

        if (vessels.length === 0) {
          app.logger.warn({ mmsi }, 'Vessel not found for diagnosis');
          return reply.code(404).send({ error: `Vessel with MMSI ${mmsi} not found` });
        }

        const vessel = vessels[0];

        // Step 3: Get scheduled task for this vessel
        const scheduledTasks = await app.db
          .select()
          .from(schema.scheduled_tasks)
          .where(eq(schema.scheduled_tasks.vessel_id, vessel.id));

        const scheduledTask = scheduledTasks.length > 0 ? scheduledTasks[0] : null;

        // Step 4: Get recent AIS checks (last 10)
        const aisChecks = await app.db
          .select()
          .from(schema.ais_checks)
          .where(eq(schema.ais_checks.vessel_id, vessel.id))
          .then(checks => checks.slice(-10));

        // Step 5: Get all sea time entries
        const seaTimeEntries = await app.db
          .select()
          .from(schema.sea_time_entries)
          .where(eq(schema.sea_time_entries.vessel_id, vessel.id));

        // Step 6: Analyze workflow status
        const issues: string[] = [];

        if (!vessel.user_id) {
          issues.push(`Vessel has no user_id (expected: ${user.id})`);
        } else if (vessel.user_id !== user.id) {
          issues.push(`Vessel user_id mismatch: ${vessel.user_id} (expected: ${user.id})`);
        }

        if (!scheduledTask) {
          issues.push('No scheduled task found for vessel');
        } else if (!scheduledTask.is_active) {
          issues.push('Scheduled task is inactive');
        } else if (scheduledTask.task_type !== 'ais_check') {
          issues.push(`Scheduled task type is "${scheduledTask.task_type}" (expected: "ais_check")`);
        }

        if (aisChecks.length === 0) {
          issues.push('No AIS checks recorded for this vessel');
        }

        const workflowStatus = issues.length === 0 ? 'OK' : 'ISSUES_FOUND';

        // Format response
        const userResponse = {
          id: user.id,
          email: user.email,
          name: user.name,
        };

        const vesselResponse = {
          id: vessel.id,
          mmsi: vessel.mmsi,
          vessel_name: vessel.vessel_name,
          is_active: vessel.is_active,
          user_id: vessel.user_id,
        };

        const scheduledTaskResponse = scheduledTask
          ? {
              id: scheduledTask.id,
              task_type: scheduledTask.task_type,
              interval_hours: scheduledTask.interval_hours,
              is_active: scheduledTask.is_active,
              last_run: scheduledTask.last_run ? scheduledTask.last_run.toISOString() : null,
              next_run: scheduledTask.next_run.toISOString(),
            }
          : null;

        const recentAisChecksResponse = aisChecks.map(check => ({
          id: check.id,
          check_time: check.check_time.toISOString(),
          is_moving: check.is_moving,
          speed_knots: check.speed_knots ? parseFloat(String(check.speed_knots)) : null,
          latitude: check.latitude ? parseFloat(String(check.latitude)) : null,
          longitude: check.longitude ? parseFloat(String(check.longitude)) : null,
        }));

        const seaTimeEntriesResponse = seaTimeEntries.map(entry => ({
          id: entry.id,
          start_time: entry.start_time.toISOString(),
          end_time: entry.end_time ? entry.end_time.toISOString() : null,
          duration_hours: entry.duration_hours ? parseFloat(String(entry.duration_hours)) : null,
          status: entry.status,
        }));

        app.logger.info(
          {
            userId: user.id,
            vesselId: vessel.id,
            mmsi,
            workflowStatus,
            issuesCount: issues.length,
          },
          'Vessel workflow diagnosis complete'
        );

        return reply.code(200).send({
          user: userResponse,
          vessel: vesselResponse,
          scheduled_task: scheduledTaskResponse,
          recent_ais_checks: recentAisChecksResponse,
          sea_time_entries: seaTimeEntriesResponse,
          workflow_status: {
            status: workflowStatus,
            issues,
          },
        });
      } catch (error) {
        app.logger.error({ err: error, mmsi, email }, 'Error diagnosing vessel workflow');
        return reply.code(500).send({ error: 'Failed to diagnose vessel workflow' });
      }
    }
  );

  // POST /api/admin/fix-vessel-workflow - Fix vessel workflow issues
  fastify.post<{ Body: { mmsi: string; email: string } }>(
    '/api/admin/fix-vessel-workflow',
    {
      schema: {
        description: 'Fix vessel workflow issues and ensure proper configuration',
        tags: ['admin'],
        body: {
          type: 'object',
          required: ['mmsi', 'email'],
          properties: {
            mmsi: { type: 'string', description: 'Vessel MMSI' },
            email: { type: 'string', format: 'email', description: 'User email' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              actions_taken: {
                type: 'array',
                items: { type: 'string' },
              },
              vessel_id: { type: 'string' },
              task_id: { type: 'string' },
              user_id: { type: 'string' },
            },
          },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { mmsi, email } = request.body;

      app.logger.info({ mmsi, email }, 'Fixing vessel workflow');

      try {
        const actionsTaken: string[] = [];

        // Step 1: Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email.toLowerCase()));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found for fix');
          return reply.code(404).send({ error: `User with email ${email} not found` });
        }

        const user = users[0];

        // Step 2: Find vessel by MMSI
        const vessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.mmsi, mmsi));

        if (vessels.length === 0) {
          app.logger.warn({ mmsi }, 'Vessel not found for fix');
          return reply.code(404).send({ error: `Vessel with MMSI ${mmsi} not found` });
        }

        let vessel = vessels[0];

        // Step 3: Update vessel.user_id if missing or incorrect
        if (!vessel.user_id || vessel.user_id !== user.id) {
          const [updatedVessel] = await app.db
            .update(schema.vessels)
            .set({ user_id: user.id })
            .where(eq(schema.vessels.id, vessel.id))
            .returning();

          vessel = updatedVessel;
          actionsTaken.push(`Updated vessel.user_id to ${user.id}`);
          app.logger.info({ vesselId: vessel.id, userId: user.id }, 'Updated vessel user_id');
        }

        // Step 4: Find or create scheduled task
        const scheduledTasks = await app.db
          .select()
          .from(schema.scheduled_tasks)
          .where(eq(schema.scheduled_tasks.vessel_id, vessel.id));

        let taskId: string;

        if (scheduledTasks.length === 0) {
          // Create new scheduled task
          const now = new Date();
          const [newTask] = await app.db
            .insert(schema.scheduled_tasks)
            .values({
              user_id: user.id,
              task_type: 'ais_check',
              vessel_id: vessel.id,
              interval_hours: '2',
              is_active: true,
              next_run: now, // Run immediately on next scheduler iteration
              last_run: null,
            })
            .returning();

          taskId = newTask.id;
          actionsTaken.push(`Created new scheduled task with 2-hour interval (task_id: ${taskId})`);
          app.logger.info({ vesselId: vessel.id, taskId }, 'Created new scheduled task');
        } else {
          const existingTask = scheduledTasks[0];
          taskId = existingTask.id;

          // Update task if needed
          let taskUpdated = false;
          const taskUpdates: any = {};

          if (!existingTask.is_active) {
            taskUpdates.is_active = true;
            taskUpdated = true;
          }

          if (existingTask.user_id !== user.id) {
            taskUpdates.user_id = user.id;
            taskUpdated = true;
          }

          if (existingTask.next_run > new Date()) {
            taskUpdates.next_run = new Date(); // Run immediately
            taskUpdated = true;
          }

          if (taskUpdated) {
            await app.db
              .update(schema.scheduled_tasks)
              .set(taskUpdates)
              .where(eq(schema.scheduled_tasks.id, existingTask.id));

            const updatesDesc = Object.keys(taskUpdates).join(', ');
            actionsTaken.push(`Updated existing scheduled task: ${updatesDesc}`);
            app.logger.info({ taskId, updates: taskUpdates }, 'Updated scheduled task');
          }
        }

        app.logger.info(
          {
            userId: user.id,
            vesselId: vessel.id,
            taskId,
            actionsTaken,
          },
          'Vessel workflow fix complete'
        );

        return reply.code(200).send({
          success: true,
          actions_taken: actionsTaken,
          vessel_id: vessel.id,
          task_id: taskId,
          user_id: user.id,
        });
      } catch (error) {
        app.logger.error({ err: error, mmsi, email }, 'Error fixing vessel workflow');
        return reply.code(500).send({ error: 'Failed to fix vessel workflow' });
      }
    }
  );

  // POST /api/admin/amalgamate-sea-time - Merge multiple AIS detections into a single sea time entry
  fastify.post<{ Body: { email: string; mmsi: string; date: string } }>(
    '/api/admin/amalgamate-sea-time',
    {
      schema: {
        description: 'Amalgamate multiple AIS detections on a specific date into a single sea time entry',
        tags: ['admin'],
        body: {
          type: 'object',
          required: ['email', 'mmsi', 'date'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email' },
            mmsi: { type: 'string', description: 'Vessel MMSI' },
            date: { type: 'string', description: 'Date in format "26 Jan 2026" or "2026-01-26"' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              entry: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  vessel_id: { type: 'string' },
                  vessel_name: { type: 'string' },
                  start_time: { type: 'string', format: 'date-time' },
                  end_time: { type: ['string', 'null'], format: 'date-time' },
                  duration_hours: { type: ['number', 'null'] },
                  status: { type: 'string' },
                  notes: { type: ['string', 'null'] },
                  created_at: { type: 'string', format: 'date-time' },
                  start_latitude: { type: ['number', 'null'] },
                  start_longitude: { type: ['number', 'null'] },
                  end_latitude: { type: ['number', 'null'] },
                  end_longitude: { type: ['number', 'null'] },
                  service_type: { type: 'string' },
                },
              },
              detections_merged: { type: 'number' },
              total_distance_nm: { type: 'number' },
              detection_times: {
                type: 'array',
                items: { type: 'string' },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, mmsi, date } = request.body;

      app.logger.info({ email, mmsi, date }, 'Starting sea time entry amalgamation');

      try {
        // Step 1: Parse the date
        let targetDate: Date;
        try {
          // Try parsing "26 Jan 2026" format
          if (date.includes(' ')) {
            const parsed = new Date(date);
            targetDate = parsed;
          } else {
            // Try parsing "2026-01-26" format
            targetDate = new Date(date);
          }

          if (isNaN(targetDate.getTime())) {
            throw new Error('Invalid date');
          }
        } catch {
          app.logger.warn({ date }, 'Invalid date format');
          return reply.code(400).send({
            error: `Invalid date format: ${date}. Use "26 Jan 2026" or "2026-01-26"`,
          });
        }

        // Step 2: Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email.toLowerCase()));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found for amalgamation');
          return reply.code(404).send({ error: `User with email ${email} not found` });
        }

        const user = users[0];

        // Step 3: Find vessel by MMSI
        const vessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.mmsi, mmsi));

        if (vessels.length === 0) {
          app.logger.warn({ mmsi }, 'Vessel not found for amalgamation');
          return reply.code(404).send({ error: `Vessel with MMSI ${mmsi} not found` });
        }

        const vessel = vessels[0];

        // Step 4: Get AIS debug logs for this vessel and date
        const allDebugLogs = await app.db
          .select()
          .from(schema.ais_debug_logs)
          .where(eq(schema.ais_debug_logs.vessel_id, vessel.id));

        // Filter logs for the target date
        const targetDateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        const logsForDate = allDebugLogs.filter(log => {
          const logDateStr = new Date(log.request_time).toISOString().split('T')[0];
          return logDateStr === targetDateStr;
        });

        app.logger.debug(
          { vesselId: vessel.id, mmsi, date: targetDateStr, logsCount: logsForDate.length },
          `Found ${logsForDate.length} AIS debug logs for date`
        );

        if (logsForDate.length === 0) {
          return reply.code(404).send({
            error: `No AIS API logs found for vessel ${mmsi} on ${date}`,
          });
        }

        // Step 5: Extract position data from response bodies
        interface Detection {
          timestamp: Date;
          latitude: number;
          longitude: number;
          logTime: string;
        }

        const detections: Detection[] = [];

        for (const log of logsForDate) {
          try {
            if (log.response_body) {
              const responseData = JSON.parse(log.response_body);

              // Extract position data from different possible API response formats
              let latitude: number | null = null;
              let longitude: number | null = null;

              // Try common response structures
              if (responseData.latitude !== undefined && responseData.longitude !== undefined) {
                latitude = responseData.latitude;
                longitude = responseData.longitude;
              } else if (
                responseData.data &&
                responseData.data.latitude !== undefined &&
                responseData.data.longitude !== undefined
              ) {
                latitude = responseData.data.latitude;
                longitude = responseData.data.longitude;
              } else if (
                responseData.position &&
                responseData.position.latitude !== undefined &&
                responseData.position.longitude !== undefined
              ) {
                latitude = responseData.position.latitude;
                longitude = responseData.position.longitude;
              }

              if (latitude !== null && longitude !== null) {
                detections.push({
                  timestamp: new Date(log.request_time),
                  latitude,
                  longitude,
                  logTime: new Date(log.request_time).toISOString(),
                });
              }
            }
          } catch (err) {
            app.logger.debug(
              { logId: log.id, err },
              'Failed to parse response body for detection'
            );
          }
        }

        if (detections.length === 0) {
          return reply.code(404).send({
            error: `No position data found in AIS API responses for ${date}`,
          });
        }

        // Sort detections by timestamp
        detections.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Step 6: Calculate total distance across all detections
        let totalDistance = 0;
        for (let i = 1; i < detections.length; i++) {
          const prev = detections[i - 1];
          const curr = detections[i];

          // Use Haversine formula
          const EARTH_RADIUS_NM = 3440.065;
          const dLat = (curr.latitude - prev.latitude) * (Math.PI / 180);
          const dLon = (curr.longitude - prev.longitude) * (Math.PI / 180);
          const lat1Rad = prev.latitude * (Math.PI / 180);
          const lat2Rad = curr.latitude * (Math.PI / 180);

          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.asin(Math.sqrt(a));
          const distance = EARTH_RADIUS_NM * c;

          totalDistance += distance;
        }

        totalDistance = Math.round(totalDistance * 100) / 100;

        // Step 7: Find existing sea time entry for this date
        const allEntries = await app.db
          .select()
          .from(schema.sea_time_entries)
          .where(eq(schema.sea_time_entries.vessel_id, vessel.id));

        const entriesForDate = allEntries.filter(entry => {
          const entryDateStr = new Date(entry.start_time).toISOString().split('T')[0];
          return entryDateStr === targetDateStr;
        });

        if (entriesForDate.length === 0) {
          return reply.code(404).send({
            error: `No sea time entry found for vessel on ${date}`,
          });
        }

        const existingEntry = entriesForDate[0];

        // Step 8: Calculate amalgamated duration
        const startTime = detections[0].timestamp;
        const endTime = detections[detections.length - 1].timestamp;
        const durationMs = endTime.getTime() - startTime.getTime();
        const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

        // Step 9: Create updated notes with all detection times
        const detectionTimesList = detections.map(d => d.logTime).join(', ');
        const updatedNotes = `Amalgamated from ${detections.length} AIS checks: vessel moved ${totalDistance} nm over ${durationHours} hours. Detections at: ${detectionTimesList}`;

        // Step 10: Update the sea time entry
        const [updatedEntry] = await app.db
          .update(schema.sea_time_entries)
          .set({
            start_time: startTime,
            end_time: endTime,
            duration_hours: String(durationHours),
            start_latitude: String(detections[0].latitude),
            start_longitude: String(detections[0].longitude),
            end_latitude: String(detections[detections.length - 1].latitude),
            end_longitude: String(detections[detections.length - 1].longitude),
            notes: updatedNotes,
          })
          .where(eq(schema.sea_time_entries.id, existingEntry.id))
          .returning();

        app.logger.info(
          {
            userId: user.id,
            vesselId: vessel.id,
            mmsi,
            entryId: updatedEntry.id,
            detectionsCount: detections.length,
            totalDistance,
            durationHours,
          },
          `Amalgamated ${detections.length} AIS detections into single entry`
        );

        // Format response
        const entryResponse = {
          id: updatedEntry.id,
          vessel_id: updatedEntry.vessel_id,
          vessel_name: vessel.vessel_name,
          start_time: updatedEntry.start_time.toISOString(),
          end_time: updatedEntry.end_time ? updatedEntry.end_time.toISOString() : null,
          duration_hours: updatedEntry.duration_hours ? parseFloat(String(updatedEntry.duration_hours)) : null,
          status: updatedEntry.status,
          notes: updatedEntry.notes,
          created_at: updatedEntry.created_at.toISOString(),
          start_latitude: updatedEntry.start_latitude ? parseFloat(String(updatedEntry.start_latitude)) : null,
          start_longitude: updatedEntry.start_longitude ? parseFloat(String(updatedEntry.start_longitude)) : null,
          end_latitude: updatedEntry.end_latitude ? parseFloat(String(updatedEntry.end_latitude)) : null,
          end_longitude: updatedEntry.end_longitude ? parseFloat(String(updatedEntry.end_longitude)) : null,
          service_type: updatedEntry.service_type,
        };

        return reply.code(200).send({
          success: true,
          message: `Successfully amalgamated ${detections.length} AIS detections into a single sea time entry`,
          entry: entryResponse,
          detections_merged: detections.length,
          total_distance_nm: totalDistance,
          detection_times: detections.map(d => d.logTime),
        });
      } catch (error) {
        app.logger.error({ err: error, email, mmsi, date }, 'Error amalgamating sea time entry');
        return reply.code(500).send({ error: 'Failed to amalgamate sea time entry' });
      }
    }
  );

  // POST /api/admin/generate-demo-entries - Generate demo sea time entries for testing
  fastify.post<{ Body: { email: string; count?: number } }>(
    '/api/admin/generate-demo-entries',
    {
      schema: {
        description: 'Generate demo sea time entries for testing purposes',
        tags: ['admin'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email' },
            count: { type: 'number', minimum: 1, maximum: 100, description: 'Number of entries to generate (default: 43)' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              userId: { type: 'string' },
              vesselId: { type: 'string' },
              entriesCreated: { type: 'number' },
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    start_time: { type: 'string', format: 'date-time' },
                    end_time: { type: 'string', format: 'date-time' },
                    duration_hours: { type: 'number' },
                    sea_days: { type: 'number' },
                    status: { type: 'string' },
                    service_type: { type: 'string' },
                    notes: { type: 'string' },
                    mca_compliant: { type: 'boolean' },
                    start_latitude: { type: 'number' },
                    start_longitude: { type: 'number' },
                    end_latitude: { type: 'number' },
                    end_longitude: { type: 'number' },
                  },
                },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const { email, count = 43 } = request.body;

      app.logger.info({ email, count }, 'Generating demo sea time entries');

      try {
        // Validate count
        if (count < 1 || count > 100) {
          app.logger.warn({ count }, 'Invalid count for demo entries');
          return reply.code(400).send({
            error: 'Count must be between 1 and 100',
          });
        }

        // Step 1: Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email.toLowerCase()));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found for demo entries');
          return reply.code(404).send({ error: `User with email ${email} not found` });
        }

        const user = users[0];
        app.logger.debug({ userId: user.id, email }, 'User found');

        // Step 2: Find or create demo vessel
        const existingVessels = await app.db
          .select()
          .from(schema.vessels)
          .where(eq(schema.vessels.mmsi, '123456789'));

        let vessel: typeof schema.vessels.$inferSelect;

        if (existingVessels.length > 0) {
          vessel = existingVessels[0];
          app.logger.debug({ vesselId: vessel.id }, 'Demo vessel already exists');
        } else {
          // Create new demo vessel
          const [newVessel] = await app.db
            .insert(schema.vessels)
            .values({
              user_id: user.id,
              vessel_name: 'Demo Yacht',
              mmsi: '123456789',
              flag: 'GBR',
              official_number: 'DEMO001',
              type: 'Yacht',
              length_metres: '24.5',
              gross_tonnes: '45',
              callsign: 'DEMO',
              engine_kilowatts: '450',
              engine_type: 'Diesel',
              is_active: true,
            })
            .returning();

          vessel = newVessel;
          app.logger.info({ vesselId: vessel.id }, 'Created demo vessel');
        }

        // Step 3: Generate demo sea time entries
        const serviceTypes = ['actual_sea_service', 'watchkeeping_service', 'standby_service', 'yard_service'];
        const statuses = Array(80).fill('confirmed')
          .concat(Array(15).fill('pending'))
          .concat(Array(5).fill('rejected'));
        const notes = [
          'Coastal passage',
          'Training voyage',
          'Delivery trip',
          'Harbor operations',
          'Routine patrol',
          'Survey mission',
          'Maintenance voyage',
          'Positioning exercise',
        ];

        const createdEntries: typeof schema.sea_time_entries.$inferSelect[] = [];
        let entriesCreatedCount = 0;
        let attemptsCount = 0;
        const maxAttempts = count * 3; // Allow up to 3x attempts to account for skipped entries

        while (entriesCreatedCount < count && attemptsCount < maxAttempts) {
          attemptsCount++;
          // Spread entries over the past 12 months
          const daysAgo = Math.floor(Math.random() * 365);
          const hoursOffset = Math.floor(Math.random() * 24);
          const startTime = new Date();
          startTime.setDate(startTime.getDate() - daysAgo);
          startTime.setHours(hoursOffset, 0, 0, 0);

          // Select service type
          const serviceType = serviceTypes[Math.floor(Math.random() * serviceTypes.length)];

          // Calculate duration based on service type
          let durationHours: number;
          switch (serviceType) {
            case 'actual_sea_service':
              durationHours = 4 + Math.random() * 8; // 4-12 hours
              break;
            case 'watchkeeping_service':
              durationHours = 2 + Math.random() * 6; // 2-8 hours
              break;
            case 'standby_service':
            case 'yard_service':
              durationHours = 4 + Math.random() * 6; // 4-10 hours
              break;
            default:
              durationHours = 6;
          }

          const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);

          // Calculate sea days
          const seaDays = Math.ceil(durationHours / 24);

          // MCA compliance (true for entries >= 4 hours)
          const mcaCompliant = durationHours >= 4;

          // Random UK coastal coordinates (latitude: 50-58, longitude: -6 to 2)
          const startLatitude = 50 + Math.random() * 8;
          const startLongitude = -6 + Math.random() * 8;
          const endLatitude = 50 + Math.random() * 8;
          const endLongitude = -6 + Math.random() * 8;

          // Random status from weighted distribution
          const status = statuses[Math.floor(Math.random() * statuses.length)];

          // Random note
          const note = notes[Math.floor(Math.random() * notes.length)];

          // Calculate distance between start and end coordinates using Haversine formula
          const EARTH_RADIUS_NM = 3440.065;
          const dLat = (endLatitude - startLatitude) * (Math.PI / 180);
          const dLon = (endLongitude - startLongitude) * (Math.PI / 180);
          const lat1Rad = startLatitude * (Math.PI / 180);
          const lat2Rad = endLatitude * (Math.PI / 180);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c = 2 * Math.asin(Math.sqrt(a));
          const distanceNm = Math.round((EARTH_RADIUS_NM * c) * 100) / 100;

          // Skip entries with minimal distance (< 0.5 nm)
          if (distanceNm < 0.5) {
            continue;
          }

          // Create entry
          const [entry] = await app.db
            .insert(schema.sea_time_entries)
            .values({
              user_id: user.id,
              vessel_id: vessel.id,
              start_time: startTime,
              end_time: endTime,
              duration_hours: String(Math.round(durationHours * 100) / 100),
              sea_days: seaDays,
              mca_compliant: mcaCompliant,
              status,
              service_type: serviceType,
              notes: note,
              detection_window_hours: String(Math.round(durationHours * 100) / 100),
              watchkeeping_hours: serviceType === 'watchkeeping_service' ? String(Math.round(durationHours * 100) / 100) : undefined,
              start_latitude: String(Math.round(startLatitude * 1000000) / 1000000),
              start_longitude: String(Math.round(startLongitude * 1000000) / 1000000),
              end_latitude: String(Math.round(endLatitude * 1000000) / 1000000),
              end_longitude: String(Math.round(endLongitude * 1000000) / 1000000),
              distance_nm: String(distanceNm),
              is_stationary: false,
            })
            .returning();

          createdEntries.push(entry);
          entriesCreatedCount++;
        }

        app.logger.info(
          { userId: user.id, vesselId: vessel.id, entriesRequested: count, entriesCreated: entriesCreatedCount, attemptsCount },
          `Generated ${entriesCreatedCount} demo sea time entries (requested ${count}, ${attemptsCount} generation attempts)`
        );

        // Format response entries
        const responseEntries = createdEntries.map(e => ({
          id: e.id,
          start_time: e.start_time.toISOString(),
          end_time: e.end_time ? e.end_time.toISOString() : '',
          duration_hours: parseFloat(String(e.duration_hours || 0)),
          sea_days: e.sea_days || 0,
          status: e.status,
          service_type: e.service_type || 'actual_sea_service',
          notes: e.notes || '',
          mca_compliant: e.mca_compliant || false,
          distance_nm: parseFloat(String(e.distance_nm || 0)),
          start_latitude: parseFloat(String(e.start_latitude || 0)),
          start_longitude: parseFloat(String(e.start_longitude || 0)),
          end_latitude: parseFloat(String(e.end_latitude || 0)),
          end_longitude: parseFloat(String(e.end_longitude || 0)),
        }));

        return reply.code(200).send({
          success: true,
          message: `Generated ${entriesCreatedCount} demo entries for user ${email}`,
          userId: user.id,
          vesselId: vessel.id,
          entriesCreated: entriesCreatedCount,
          entries: responseEntries,
        });
      } catch (error) {
        app.logger.error({ err: error, email, count }, 'Error generating demo sea time entries');
        return reply.code(500).send({ error: 'Failed to generate demo sea time entries' });
      }
    }
  );

  // PUT /api/admin/update-subscription - Update user subscription status by email
  fastify.put<{
    Body: {
      email: string;
      subscription_status: string;
      subscription_expires_at?: string;
      subscription_product_id?: string;
      subscription_platform?: string;
    };
  }>(
    '/api/admin/update-subscription',
    {
      schema: {
        description: 'Admin endpoint to update subscription status for a user by email',
        tags: ['admin'],
        body: {
          type: 'object',
          required: ['email', 'subscription_status'],
          properties: {
            email: { type: 'string', format: 'email', description: 'User email' },
            subscription_status: {
              type: 'string',
              enum: ['active', 'inactive', 'trialing', 'expired'],
              description: 'Subscription status',
            },
            subscription_expires_at: {
              type: 'string',
              format: 'date-time',
              description: 'Optional subscription expiration date (ISO 8601)',
            },
            subscription_product_id: {
              type: 'string',
              description: 'Optional product ID',
            },
            subscription_platform: {
              type: 'string',
              enum: ['ios', 'android', 'web'],
              description: 'Optional platform',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  subscription_status: { type: 'string' },
                  subscription_expires_at: { type: ['string', 'null'], format: 'date-time' },
                  subscription_product_id: { type: ['string', 'null'] },
                  subscription_platform: { type: ['string', 'null'] },
                },
              },
            },
          },
          400: { type: 'object', properties: { error: { type: 'string' } } },
          404: { type: 'object', properties: { error: { type: 'string' } } },
          500: { type: 'object', properties: { error: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const {
        email,
        subscription_status,
        subscription_expires_at,
        subscription_product_id,
        subscription_platform,
      } = request.body;

      app.logger.info(
        { email, subscription_status },
        'Admin updating subscription status for user'
      );

      try {
        // Validate subscription status
        const validStatuses = ['active', 'inactive', 'trialing', 'expired'];
        if (!validStatuses.includes(subscription_status)) {
          app.logger.warn(
            { email, subscription_status },
            'Invalid subscription status provided'
          );
          return reply.code(400).send({
            error: `Invalid subscription status. Must be one of: ${validStatuses.join(', ')}`,
          });
        }

        // Find user by email
        const users = await app.db
          .select()
          .from(authSchema.user)
          .where(eq(authSchema.user.email, email));

        if (users.length === 0) {
          app.logger.warn({ email }, 'User not found for subscription update');
          return reply.code(404).send({ error: 'User not found' });
        }

        const user = users[0];

        // Parse optional expiration date
        let expiresAt: Date | null = null;
        if (subscription_expires_at) {
          try {
            expiresAt = new Date(subscription_expires_at);
            if (isNaN(expiresAt.getTime())) {
              return reply.code(400).send({
                error: 'Invalid subscription_expires_at date format. Must be ISO 8601.',
              });
            }
          } catch (error) {
            return reply.code(400).send({
              error: 'Invalid subscription_expires_at date format. Must be ISO 8601.',
            });
          }
        }

        // Update user subscription
        const updateData: any = {
          subscription_status,
          updatedAt: new Date(),
        };

        if (subscription_expires_at) {
          updateData.subscription_expires_at = expiresAt;
        }

        if (subscription_product_id) {
          updateData.subscription_product_id = subscription_product_id;
        }

        if (subscription_platform) {
          updateData.subscription_platform = subscription_platform;
        }

        const updatedUsers = await app.db
          .update(authSchema.user)
          .set(updateData)
          .where(eq(authSchema.user.id, user.id))
          .returning();

        if (updatedUsers.length === 0) {
          throw new Error('Failed to update user subscription');
        }

        const updatedUser = updatedUsers[0];

        app.logger.info(
          {
            userId: user.id,
            email,
            subscription_status,
            subscription_expires_at: expiresAt?.toISOString(),
          },
          'User subscription updated successfully'
        );

        // Format response
        const expiresAtString = (updatedUser as any).subscription_expires_at
          ? new Date((updatedUser as any).subscription_expires_at).toISOString()
          : null;

        return reply.code(200).send({
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            subscription_status: (updatedUser as any).subscription_status,
            subscription_expires_at: expiresAtString,
            subscription_product_id: (updatedUser as any).subscription_product_id || null,
            subscription_platform: (updatedUser as any).subscription_platform || null,
          },
        });
      } catch (error) {
        app.logger.error(
          { err: error, email, subscription_status },
          'Error updating user subscription'
        );
        return reply.code(500).send({
          error: 'Failed to update user subscription',
        });
      }
    }
  );
}
