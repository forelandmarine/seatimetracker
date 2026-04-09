import { eq, and, desc, isNotNull, lte, gte, isNull, sql } from 'drizzle-orm';
import * as schema from '../db/schema.js';
import * as authSchema from '../db/auth-schema.js';
import type { App } from '../index.js';
import { fetchVesselAISDataWithFallback } from '../routes/ais.js';
import { processNotificationSchedules } from '../routes/notifications.js';
import { isSubscriptionActive as checkSubscriptionActive } from '../utils/subscription.js';
import { sendDay3Email, sendDay7Email } from '../utils/welcomeEmail.js';

const SCHEDULER_CHECK_INTERVAL_MS = 60 * 1000; // Check every minute
const LOCATION_CHANGE_THRESHOLD = 0.1; // degrees (latitude/longitude)

// Track which users have received drip emails (in-memory cache; resets on restart
// but the database createdAt window prevents double-sends across restarts).
const day3Sent = new Set<string>();
const day7Sent = new Set<string>();

let schedulerInterval: NodeJS.Timeout | null = null;
let isSchedulerRunning = false;

/**
 * Start the background scheduler for periodic vessel position checks
 */
export async function startScheduler(app: App): Promise<void> {
  if (schedulerInterval) {
    app.logger.warn('Scheduler is already running');
    return;
  }

  app.logger.info('Starting automatic vessel position scheduler');

  // Run the scheduler immediately on startup
  await runSchedulerIteration(app);

  // Then schedule it to run every minute
  schedulerInterval = setInterval(async () => {
    await runSchedulerIteration(app);
  }, SCHEDULER_CHECK_INTERVAL_MS);

  app.logger.info('Scheduler started - will check for due tasks every minute');
}

/**
 * Stop the background scheduler
 */
export function stopScheduler(app: App): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    app.logger.info('Scheduler stopped');
  }
}

/**
 * Run a single scheduler iteration - check for due tasks
 */
/**
 * Process the welcome email drip sequence.
 *
 * Sends day-3 email to users created 3-4 days ago that haven't received it.
 * Sends day-7 email to users created 7-8 days ago that haven't received it.
 *
 * Uses an in-memory cache to avoid double-sending within the same process
 * lifetime. The createdAt window prevents the same user being eligible across
 * multiple iterations on the same day.
 */
async function processDripEmails(app: App): Promise<void> {
  const now = new Date();
  const day3Start = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const day3End = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const day7Start = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const day7End = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Day 3: users created 3-4 days ago
  const day3Users = await app.db
    .select()
    .from(authSchema.user)
    .where(
      and(
        gte(authSchema.user.createdAt, day3Start),
        lte(authSchema.user.createdAt, day3End)
      )
    );

  for (const u of day3Users) {
    if (!u.email || day3Sent.has(u.id)) continue;
    try {
      const result = await sendDay3Email({ email: u.email, name: u.name }, app.logger);
      if (result.success) {
        day3Sent.add(u.id);
        app.logger.info({ userId: u.id, email: u.email }, 'Day-3 drip email sent');
      }
    } catch (err) {
      app.logger.warn({ err, userId: u.id }, 'Day-3 email failed');
    }
  }

  // Day 7: users created 7-8 days ago
  const day7Users = await app.db
    .select()
    .from(authSchema.user)
    .where(
      and(
        gte(authSchema.user.createdAt, day7Start),
        lte(authSchema.user.createdAt, day7End)
      )
    );

  for (const u of day7Users) {
    if (!u.email || day7Sent.has(u.id)) continue;
    try {
      const result = await sendDay7Email({ email: u.email, name: u.name }, app.logger);
      if (result.success) {
        day7Sent.add(u.id);
        app.logger.info({ userId: u.id, email: u.email }, 'Day-7 drip email sent');
      }
    } catch (err) {
      app.logger.warn({ err, userId: u.id }, 'Day-7 email failed');
    }
  }
}

async function runSchedulerIteration(app: App): Promise<void> {
  if (isSchedulerRunning) {
    app.logger.debug('Scheduler iteration already in progress, skipping');
    return;
  }

  isSchedulerRunning = true;

  try {
    const now = new Date();
    app.logger.debug(`Scheduler iteration at ${now.toISOString()}`);

    // Process notification schedules
    try {
      await processNotificationSchedules(app);
    } catch (error) {
      app.logger.error({ err: error }, 'Error processing notification schedules');
    }

    // Process welcome email drip sequence (day 3 and day 7)
    try {
      await processDripEmails(app);
    } catch (error) {
      app.logger.error({ err: error }, 'Error processing drip emails');
    }

    // Find all due scheduled tasks that are active AND for active vessels only
    app.logger.debug(
      { currentTime: now.toISOString() },
      'Querying for due AIS check tasks where: task_type=ais_check AND task.is_active=true AND vessel.is_active=true AND next_run <= now'
    );

    const dueTasks = await app.db
      .select({
        task: schema.scheduled_tasks,
        vessel: schema.vessels,
        user: authSchema.user,
      })
      .from(schema.scheduled_tasks)
      .innerJoin(schema.vessels, eq(schema.vessels.id, schema.scheduled_tasks.vessel_id))
      .innerJoin(authSchema.user, eq(authSchema.user.id, schema.vessels.user_id))
      .where(
        and(
          eq(schema.scheduled_tasks.task_type, 'ais_check'),
          eq(schema.scheduled_tasks.is_active, true),
          eq(schema.vessels.is_active, true),
          lte(schema.scheduled_tasks.next_run, now)
        )
      );

    app.logger.debug(
      {
        queriedTime: now.toISOString(),
        foundDueTasks: dueTasks.length,
        tasks: dueTasks.map(({ task, vessel, user }) => ({
          taskId: task.id,
          vesselId: vessel.id,
          vesselName: vessel.vessel_name,
          mmsi: vessel.mmsi,
          userId: vessel.user_id,
          subscriptionStatus: (user as any).subscription_status || 'inactive',
          subscriptionExpiresAt: (user as any).subscription_expires_at?.toISOString() || null,
          nextRun: task.next_run.toISOString(),
          isDue: task.next_run <= now,
        })),
      },
      `Query result: found ${dueTasks.length} due AIS check task(s) for active vessels`
    );

    // Filter tasks by subscription status using the shared helper
    const activeSubscriptionTasks = dueTasks.filter(({ user }) => {
      const u = user as any;
      return checkSubscriptionActive(u.subscription_status, u.subscription_expires_at);
    });

    const inactiveSubscriptionTasks = dueTasks.filter(({ user }) => {
      const u = user as any;
      return !checkSubscriptionActive(u.subscription_status, u.subscription_expires_at);
    });

    // Skip vessels with inactive subscriptions — do NOT deactivate or delete tasks.
    // Subscription may renew shortly (e.g. billing retry, App Store delay).
    // Tracking state should persist so it resumes automatically on renewal.
    if (inactiveSubscriptionTasks.length > 0) {
      app.logger.info(
        {
          skippedTaskCount: inactiveSubscriptionTasks.length,
          tasks: inactiveSubscriptionTasks.map(({ task, vessel, user }) => ({
            taskId: task.id,
            vesselId: vessel.id,
            vesselName: vessel.vessel_name,
            userId: vessel.user_id,
            subscriptionStatus: (user as any).subscription_status || 'inactive',
          })),
        },
        `Skipping ${inactiveSubscriptionTasks.length} task(s) due to inactive subscription (vessels remain active for auto-resume)`
      );
    }

    // Log which vessels are being checked
    if (activeSubscriptionTasks.length > 0) {
      const vesselsList = activeSubscriptionTasks.map(({ vessel }) => `${vessel.vessel_name} (MMSI: ${vessel.mmsi}, user: ${vessel.user_id})`).join('; ');
      app.logger.debug(
        { vesselCount: activeSubscriptionTasks.length, vessels: vesselsList },
        `Checking positions for vessels: ${vesselsList}`
      );
    }

    if (activeSubscriptionTasks.length === 0) {
      app.logger.debug('No due AIS check tasks found for active vessels with active subscriptions');
      return;
    }

    app.logger.info(
      { taskCount: activeSubscriptionTasks.length, timestamp: now.toISOString() },
      `Found ${activeSubscriptionTasks.length} due AIS check task(s) for active vessels with active subscriptions - checking vessel positions every 2 hours`
    );

    // Process each due task and track results
    let processedSuccessfully = 0;
    let processedWithErrors = 0;

    // Process each due task
    for (const { task, vessel } of activeSubscriptionTasks) {
      try {
        app.logger.info(
          {
            taskId: task.id,
            vesselId: vessel.id,
            vesselName: vessel.vessel_name,
            mmsi: vessel.mmsi,
            userId: vessel.user_id,
            taskUserId: task.user_id,
            interval: task.interval_hours,
          },
          `Executing AIS check task for vessel ${vessel.vessel_name} (MMSI: ${vessel.mmsi}) for user ${vessel.user_id} with ${task.interval_hours}-hour interval`
        );

        await processScheduledTask(app, task, vessel);
        processedSuccessfully++;
      } catch (error) {
        processedWithErrors++;
        app.logger.error(
          { err: error, taskId: task.id, vesselId: vessel.id, mmsi: vessel.mmsi },
          `Error processing scheduled task for vessel ${vessel.vessel_name} (MMSI: ${vessel.mmsi})`
        );
      }
    }

    // Log summary of scheduler iteration
    app.logger.info(
      {
        totalTasksFound: dueTasks.length,
        tasksWithActiveSubscription: activeSubscriptionTasks.length,
        tasksSkippedInactiveSubscription: inactiveSubscriptionTasks.length,
        processedSuccessfully,
        processedWithErrors,
        completionRate: activeSubscriptionTasks.length > 0 ? `${Math.round((processedSuccessfully / activeSubscriptionTasks.length) * 100)}%` : 'N/A',
        iterationTime: now.toISOString(),
      },
      `Scheduler iteration complete: ${dueTasks.length} tasks found, ${inactiveSubscriptionTasks.length} skipped (inactive subscription), ${activeSubscriptionTasks.length} active, ${processedSuccessfully} processed successfully, ${processedWithErrors} failed`
    );
  } catch (error) {
    app.logger.error({ err: error }, 'Error in scheduler iteration');
  } finally {
    isSchedulerRunning = false;
  }
}

/**
 * Update the scheduled task's next_run time
 */
/**
 * Adaptive interval: shorter checks when underway, longer when stationary.
 * Saves API credits and gives sub-hour resolution to active voyages.
 *
 * - Underway (moving): 30 minutes
 * - Stationary in port: 6 hours
 * - Default (no movement data yet): use task's configured interval
 */
function computeNextRunInterval(
  defaultIntervalHours: string,
  isMoving: boolean | null
): number {
  if (isMoving === true) {
    return 0.5; // 30 minutes
  }
  if (isMoving === false) {
    return 6; // 6 hours
  }
  return parseInt(defaultIntervalHours) || 2;
}

async function updateScheduledTaskNextRun(
  app: App,
  taskId: string,
  intervalHours: string,
  isMoving: boolean | null = null
): Promise<void> {
  try {
    const checkTime = new Date();
    const intervalHoursNum = computeNextRunInterval(intervalHours, isMoving);
    const nextRunTime = new Date(checkTime.getTime() + intervalHoursNum * 60 * 60 * 1000);

    await app.db
      .update(schema.scheduled_tasks)
      .set({
        last_run: checkTime,
        next_run: nextRunTime,
      })
      .where(eq(schema.scheduled_tasks.id, taskId));

    app.logger.debug(
      {
        taskId,
        lastRun: checkTime.toISOString(),
        nextRun: nextRunTime.toISOString(),
        intervalHours: intervalHoursNum,
        isMoving,
      },
      `Updated scheduled task next_run time (${intervalHoursNum}h interval, isMoving=${isMoving})`
    );
  } catch (error) {
    app.logger.error(
      { err: error, taskId },
      `Failed to update scheduled task next_run time`
    );
  }
}

/**
 * Process a single scheduled task
 */
async function processScheduledTask(
  app: App,
  task: typeof schema.scheduled_tasks.$inferSelect,
  vessel: typeof schema.vessels.$inferSelect
): Promise<void> {
  const { id: taskId, vessel_id: vesselId, interval_hours, next_run } = task;
  const { vessel_name, mmsi, id, is_active, user_id } = vessel;

  app.logger.info(
    {
      taskId,
      vesselId,
      vesselName: vessel_name,
      mmsi,
      userId: user_id,
      isActive: is_active,
      scheduledFor: next_run.toISOString(),
    },
    `Processing scheduled AIS check for active vessel ${vessel_name} (MMSI: ${mmsi}) for user ${user_id}: checking 2-hour position window`
  );

  // Check if at least one API key is configured
  const hasApiKeys = process.env.DATALASTIC_API_KEY || process.env.MYSHIPTRACKING_API_KEY || process.env.BASE44_API_KEY;
  if (!hasApiKeys) {
    app.logger.warn('No AIS API keys configured, skipping task execution');
    return;
  }

  // Fetch current vessel AIS data using fallback chain: Datalastic → MyShipTracking → Base44
  const { data: ais_data, apiSource } = await fetchVesselAISDataWithFallback(mmsi, app.logger, vesselId, app, user_id, true);

  if (ais_data.error) {
    app.logger.warn(
      { error: ais_data.error, taskId, vesselId, mmsi },
      `Failed to fetch AIS data for scheduled task: ${taskId}, vessel=${vessel_name} (MMSI: ${mmsi})`
    );
    // Still update the task's next_run time even on fetch error.
    // Use a longer retry interval (1 hour) so we don't hammer the API.
    await updateScheduledTaskNextRun(app, taskId, '1', null);
    return;
  }

  // Store the AIS check result
  const check_time = new Date();

  app.logger.debug(
    {
      taskId,
      vesselId,
      mmsi,
      userId: user_id,
      checkTime: check_time.toISOString(),
      isMoving: ais_data.is_moving,
      speed: ais_data.speed_knots,
      latitude: ais_data.latitude,
      longitude: ais_data.longitude,
    },
    `[2-HOUR OBSERVATION] About to insert AIS check with location data for vessel ${vessel_name} (MMSI: ${mmsi}): lat=${ais_data.latitude}, lng=${ais_data.longitude}, speed=${ais_data.speed_knots}kts, moving=${ais_data.is_moving}`
  );

  let ais_check: typeof schema.ais_checks.$inferSelect | null = null;
  let insertError: Error | null = null;

  try {
    const insertResult = await app.db
      .insert(schema.ais_checks)
      .values({
        user_id: user_id,
        vessel_id: vesselId,
        check_time,
        is_moving: ais_data.is_moving,
        speed_knots: ais_data.speed_knots !== null ? String(ais_data.speed_knots) : null,
        latitude: ais_data.latitude !== null ? String(ais_data.latitude) : null,
        longitude: ais_data.longitude !== null ? String(ais_data.longitude) : null,
        api_source: apiSource,
      })
      .returning();

    if (!insertResult || insertResult.length === 0) {
      app.logger.error(
        { taskId, vesselId, mmsi },
        `AIS check insert returned no results for vessel ${vessel_name} (MMSI: ${mmsi})`
      );
      insertError = new Error('Insert returned no results');
    } else {
      ais_check = insertResult[0];

      app.logger.info(
        {
          taskId,
          vesselId,
          mmsi,
          checkId: ais_check.id,
          isMoving: ais_data.is_moving,
          speed: ais_data.speed_knots,
          latitude: ais_data.latitude,
          longitude: ais_data.longitude,
          checkTime: ais_check.check_time.toISOString(),
          apiSource,
        },
        `AIS check inserted successfully for vessel ${vessel_name} (MMSI: ${mmsi}): checkId=${ais_check.id}, is_moving=${ais_data.is_moving}, speed=${ais_data.speed_knots} knots, lat=${ais_data.latitude}, lng=${ais_data.longitude}, api_source=${apiSource}, time=${ais_check.check_time.toISOString()}`
      );
    }
  } catch (err) {
    insertError = err instanceof Error ? err : new Error(String(err));
    app.logger.error(
      {
        err: insertError,
        taskId,
        vesselId,
        mmsi,
        userId: user_id,
        checkTime: check_time.toISOString(),
      },
      `Failed to insert AIS check for vessel ${vessel_name} (MMSI: ${mmsi})`
    );
  }

  // Update ais_query_timestamps so manual user checks respect the rate limit
  // (previously only the HTTP endpoint wrote this, so a user could re-check
  // immediately after a scheduled check completed)
  if (ais_check) {
    try {
      const existingTs = await app.db
        .select()
        .from(schema.ais_query_timestamps)
        .where(and(
          eq(schema.ais_query_timestamps.vessel_id, vesselId),
          eq(schema.ais_query_timestamps.user_id, user_id)
        ));

      if (existingTs.length > 0) {
        await app.db
          .update(schema.ais_query_timestamps)
          .set({ last_query_time: check_time })
          .where(eq(schema.ais_query_timestamps.id, existingTs[0].id));
      } else {
        await app.db
          .insert(schema.ais_query_timestamps)
          .values({ vessel_id: vesselId, user_id: user_id, last_query_time: check_time });
      }
    } catch (tsError) {
      app.logger.warn({ err: tsError, vesselId }, 'Failed to update ais_query_timestamps from scheduler (non-critical)');
    }
  }

  // Handle sea time entry lifecycle based on movement analysis (only if AIS check was successful)
  if (ais_check) {
    // First check for offshore passages (long gaps with significant distance)
    await handleOffshorePassage(app, vesselId, vessel_name, mmsi, user_id, ais_check, taskId);

    // Then handle regular 2-hour window detections
    await handleSeaTimeEntries(app, vessel, vesselId, vessel_name, mmsi, ais_data.is_moving, check_time, taskId, user_id);
  }

  // Adaptive interval: shorter checks when underway, longer when stationary.
  // 30 min when moving, 6 hours when stationary, default otherwise.
  const adaptiveIntervalHours = computeNextRunInterval(interval_hours, ais_data.is_moving ?? null);
  const nextRunTime = new Date(check_time.getTime() + adaptiveIntervalHours * 60 * 60 * 1000);
  const intervalHours = adaptiveIntervalHours;

  app.logger.debug(
    {
      taskId,
      vesselId,
      mmsi,
      currentTime: check_time.toISOString(),
      intervalHours,
      nextRunTime: nextRunTime.toISOString(),
    },
    `Updating scheduled task: last_run=${check_time.toISOString()}, next_run=${nextRunTime.toISOString()}`
  );

  let taskUpdateSuccess = false;
  try {
    const updateResult = await app.db
      .update(schema.scheduled_tasks)
      .set({
        last_run: check_time,
        next_run: nextRunTime,
      })
      .where(eq(schema.scheduled_tasks.id, taskId))
      .returning();

    if (!updateResult || updateResult.length === 0) {
      app.logger.warn(
        { taskId, vesselId, mmsi },
        `Task update returned no results but may have succeeded`
      );
    } else {
      taskUpdateSuccess = true;
      app.logger.debug(
        { taskId, vesselId, mmsi, nextRun: nextRunTime.toISOString() },
        `Scheduled task updated successfully`
      );
    }
  } catch (updateError) {
    app.logger.error(
      {
        err: updateError,
        taskId,
        vesselId,
        mmsi,
      },
      `Failed to update scheduled task for vessel ${vessel_name} (MMSI: ${mmsi})`
    );
  }

  const successStatus = ais_check ? 'with AIS check' : 'without AIS check (insert failed)';
  app.logger.info(
    {
      taskId,
      vesselId,
      mmsi,
      vesselName: vessel_name,
      userId: user_id,
      lastRun: check_time.toISOString(),
      nextRun: nextRunTime.toISOString(),
      interval: intervalHours,
      aisCheckInserted: ais_check ? ais_check.id : 'failed',
      taskUpdateSuccess,
    },
    `Scheduled task complete for vessel ${vessel_name} (MMSI: ${mmsi}) ${successStatus}: next 2-hour position check at ${nextRunTime.toISOString()}`
  );
}

/**
 * Calculate great circle distance between two coordinates using Haversine formula
 * Returns distance in Nautical Miles
 *
 * Formula: distance = 2 * R * asin(sqrt(sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)))
 * R = 3440.065 nautical miles (Earth's radius)
 */
function calculateDistanceNauticalMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const EARTH_RADIUS_NM = 3440.065; // Nautical miles

  // Convert degrees to radians
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);

  // Haversine formula
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  const distance = EARTH_RADIUS_NM * c;

  // Round to 2 decimal places
  return Math.round(distance * 100) / 100;
}

/**
 * Helper function to extract calendar day (YYYY-MM-DD) from a date
 */
function getCalendarDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Detect and handle offshore passages (vessel travels > 50nm with 3+ days gap in AIS data)
 * Creates sea time entries for each calendar day in the gap
 */
async function handleOffshorePassage(
  app: App,
  vesselId: string,
  vessel_name: string,
  mmsi: string,
  userId: string,
  currentCheck: typeof schema.ais_checks.$inferSelect,
  taskId: string
): Promise<void> {
  try {
    // Get all AIS checks for this vessel, ordered by time
    const allChecks = await app.db
      .select()
      .from(schema.ais_checks)
      .where(eq(schema.ais_checks.vessel_id, vesselId))
      .orderBy(schema.ais_checks.check_time);

    if (allChecks.length < 2) {
      app.logger.debug(
        { vesselId, mmsi, checkCount: allChecks.length },
        `Not enough AIS checks for offshore passage detection (need 2+)`
      );
      return;
    }

    // Find the previous check (the one before current)
    const previousCheckIndex = allChecks.findIndex(c => c.id === currentCheck.id) - 1;
    if (previousCheckIndex < 0) {
      app.logger.debug({ vesselId, mmsi }, 'Current check is the first check, skipping offshore passage detection');
      return;
    }

    const previousCheck = allChecks[previousCheckIndex];

    // Check if both positions have valid coordinates
    if (!previousCheck.latitude || !previousCheck.longitude || !currentCheck.latitude || !currentCheck.longitude) {
      app.logger.debug(
        { vesselId, mmsi },
        `Missing position data in checks, skipping offshore passage detection`
      );
      return;
    }

    // Calculate time gap in days
    const timeDiffMs = currentCheck.check_time.getTime() - previousCheck.check_time.getTime();
    const daysBetween = timeDiffMs / (1000 * 60 * 60 * 24);

    // Check if gap is at least 3 days
    if (daysBetween < 3) {
      app.logger.debug(
        { vesselId, mmsi, daysBetween: Math.round(daysBetween * 100) / 100 },
        `Gap too short for offshore passage (need 3+ days, got ${Math.round(daysBetween * 100) / 100})`
      );
      return;
    }

    // Calculate distance between previous and current positions
    const prevLat = parseFloat(String(previousCheck.latitude));
    const prevLng = parseFloat(String(previousCheck.longitude));
    const currLat = parseFloat(String(currentCheck.latitude));
    const currLng = parseFloat(String(currentCheck.longitude));

    const distanceNm = calculateDistanceNauticalMiles(prevLat, prevLng, currLat, currLng);

    // Check if distance is > 50nm (offshore passage threshold)
    if (distanceNm <= 50) {
      app.logger.debug(
        { vesselId, mmsi, distanceNm, threshold: 50 },
        `Distance too short for offshore passage (need >50nm, got ${distanceNm}nm)`
      );
      return;
    }

    // Reject implausible distances — likely bad AIS data (e.g., 0,0 coordinates)
    const MAX_OFFSHORE_DISTANCE_NM = 5000; // generous for multi-day ocean crossings
    if (distanceNm > MAX_OFFSHORE_DISTANCE_NM) {
      app.logger.warn(
        { vesselId, mmsi, distanceNm, maxPlausible: MAX_OFFSHORE_DISTANCE_NM },
        `Offshore passage distance implausible (${distanceNm} nm), likely bad AIS data — skipping`
      );
      return;
    }

    // Offshore passage detected!
    const daysCount = Math.ceil(daysBetween);

    app.logger.info(
      {
        taskId,
        vesselId,
        mmsi,
        userId,
        distanceNm,
        daysBetween: Math.round(daysBetween * 100) / 100,
        daysCount,
        previousCheckTime: previousCheck.check_time.toISOString(),
        currentCheckTime: currentCheck.check_time.toISOString(),
      },
      `Offshore passage detected for vessel ${vessel_name} (MMSI: ${mmsi}): ${distanceNm}nm over ${Math.round(daysBetween * 100) / 100} days, creating ${daysCount} sea day entries`
    );

    // Generate sea time entries for each day in the gap (including end day, excluding start day)
    const entriesCreated: string[] = [];

    for (let dayOffset = 1; dayOffset <= daysCount; dayOffset++) {
      // Calculate the calendar day (starting from day after previous check)
      const dayDate = new Date(previousCheck.check_time.getTime() + dayOffset * 24 * 60 * 60 * 1000);

      // Create start time as 00:00:00 UTC for that day
      const startTime = new Date(Date.UTC(
        dayDate.getUTCFullYear(),
        dayDate.getUTCMonth(),
        dayDate.getUTCDate(),
        0, 0, 0, 0
      ));

      // Create end time as 23:59:59 UTC for that day
      const endTime = new Date(Date.UTC(
        dayDate.getUTCFullYear(),
        dayDate.getUTCMonth(),
        dayDate.getUTCDate(),
        23, 59, 59, 999
      ));

      try {
        const [entry] = await app.db
          .insert(schema.sea_time_entries)
          .values({
            user_id: userId,
            vessel_id: vesselId,
            start_time: startTime,
            end_time: endTime,
            duration_hours: '24',
            sea_days: 1,
            start_latitude: String(prevLat),
            start_longitude: String(prevLng),
            end_latitude: String(currLat),
            end_longitude: String(currLng),
            status: 'pending',
            service_type: 'actual_sea_service',
            mca_compliant: true, // 24 hours > 4 hour requirement
            is_stationary: false,
            distance_nm: String(distanceNm),
            notes: `Offshore passage detected: vessel traveled ${distanceNm} nm over ${Math.round(daysBetween * 100) / 100} days. Estimated sea day.`,
          })
          .returning();

        entriesCreated.push(entry.id);

        app.logger.info(
          {
            taskId,
            vesselId,
            mmsi,
            entryId: entry.id,
            dayDate: getCalendarDay(dayDate),
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationHours: 24,
            seaDays: 1,
            mcaCompliant: true,
          },
          `Created offshore passage sea day entry for ${getCalendarDay(dayDate)}: ${entry.id}`
        );
      } catch (error) {
        app.logger.error(
          { err: error, vesselId, mmsi, dayOffset, dayDate: getCalendarDay(dayDate) },
          `Failed to create offshore passage entry for day offset ${dayOffset}`
        );
      }
    }

    app.logger.info(
      {
        taskId,
        vesselId,
        mmsi,
        userId,
        entriesCreated: entriesCreated.length,
        distanceNm,
        daysBetween: Math.round(daysBetween * 100) / 100,
      },
      `Offshore passage processing complete for vessel ${vessel_name}: created ${entriesCreated.length} sea day entries`
    );
  } catch (error) {
    app.logger.error(
      { err: error, vesselId, mmsi, userId, taskId },
      `Error processing offshore passage for vessel ${vessel_name}`
    );
  }
}

/**
 * Handle sea time entry creation with simplified 2-hour window logic and compounding for same calendar day
 *
 * ALGORITHM:
 * 1. Get current AIS position (from check_time)
 * 2. Get AIS position from 2 hours ago
 * 3. If position difference > 0.1 degrees (latitude or longitude):
 *    a. Check if there's an existing PENDING sea time entry for the same vessel on the same calendar day
 *    b. If YES: EXTEND the existing entry by updating its end_time and end position
 *    c. If NO: CREATE a new pending sea time entry
 * 4. If difference <= 0.1 degrees:
 *    - No entry created (vessel hasn't moved significantly)
 */
async function handleSeaTimeEntries(
  app: App,
  vessel: typeof schema.vessels.$inferSelect,
  vesselId: string,
  vessel_name: string,
  mmsi: string,
  is_moving: boolean,
  check_time: Date,
  taskId: string,
  userId: string
): Promise<void> {
  // Using 2-hour position check interval
  const twoHoursAgo = new Date(check_time.getTime() - 2 * 60 * 60 * 1000);

  const allChecks = await app.db
    .select()
    .from(schema.ais_checks)
    .where(eq(schema.ais_checks.vessel_id, vesselId))
    .orderBy(schema.ais_checks.check_time);

  app.logger.debug(
    { vesselId, mmsi, userId, checkTime: check_time.toISOString(), twoHoursAgoTime: twoHoursAgo.toISOString() },
    `Using 2-hour position check interval for vessel ${vessel_name} (user: ${userId})`
  );

  // Find the most recent check before 2 hours ago
  const oldCheck = allChecks
    .filter(check => check.check_time <= twoHoursAgo)
    .sort((a, b) => new Date(b.check_time).getTime() - new Date(a.check_time).getTime())[0];

  if (!oldCheck) {
    app.logger.debug(
      { vesselId, mmsi, twoHoursAgoTime: twoHoursAgo.toISOString() },
      `No AIS check found from 2 hours ago for vessel ${vessel_name}, skipping entry creation`
    );
    return;
  }

  // Get current check (most recent)
  const currentCheck = allChecks[allChecks.length - 1];

  if (!currentCheck || !oldCheck.latitude || !oldCheck.longitude || !currentCheck.latitude || !currentCheck.longitude) {
    app.logger.debug(
      { vesselId, mmsi },
      `Missing position data for vessel ${vessel_name}, skipping entry creation`
    );
    return;
  }

  // Calculate position difference
  const oldLat = parseFloat(String(oldCheck.latitude));
  const oldLng = parseFloat(String(oldCheck.longitude));
  const currentLat = parseFloat(String(currentCheck.latitude));
  const currentLng = parseFloat(String(currentCheck.longitude));

  // Reject (0,0) coordinates — common AIS error / default value
  if ((oldLat === 0 && oldLng === 0) || (currentLat === 0 && currentLng === 0)) {
    app.logger.warn(
      { vesselId, mmsi, oldLat, oldLng, currentLat, currentLng },
      `Skipping entry: (0,0) coordinates detected — likely bad AIS data`
    );
    return;
  }

  // Reject NaN coordinates
  if (isNaN(oldLat) || isNaN(oldLng) || isNaN(currentLat) || isNaN(currentLng)) {
    app.logger.warn(
      { vesselId, mmsi },
      `Skipping entry: NaN coordinates detected`
    );
    return;
  }

  const latDiff = Math.abs(currentLat - oldLat);
  const lngDiff = Math.abs(currentLng - oldLng);
  const maxDiff = Math.max(latDiff, lngDiff);

  app.logger.info(
    {
      vesselId,
      mmsi,
      oldCheckTime: oldCheck.check_time.toISOString(),
      oldLat,
      oldLng,
      currentCheckTime: currentCheck.check_time.toISOString(),
      currentLat,
      currentLng,
      latDiff: Math.round(latDiff * 10000) / 10000,
      lngDiff: Math.round(lngDiff * 10000) / 10000,
      maxDiff: Math.round(maxDiff * 10000) / 10000,
      movementDetected: maxDiff > LOCATION_CHANGE_THRESHOLD,
    },
    `2-hour window analysis for vessel ${vessel_name}: position change ${Math.round(maxDiff * 10000) / 10000}° (threshold: ${LOCATION_CHANGE_THRESHOLD}°)`
  );

  // No movement detected
  if (maxDiff <= LOCATION_CHANGE_THRESHOLD) {
    app.logger.debug(
      { vesselId, mmsi, positionChange: Math.round(maxDiff * 10000) / 10000 },
      `Vessel ${vessel_name} has not moved significantly (${Math.round(maxDiff * 10000) / 10000}° <= ${LOCATION_CHANGE_THRESHOLD}°), skipping entry creation`
    );
    return;
  }

  // Calculate duration of this 2-hour window
  const durationMs = currentCheck.check_time.getTime() - oldCheck.check_time.getTime();
  const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

  // Calculate distance in Nautical Miles using Haversine formula
  const distanceNm = calculateDistanceNauticalMiles(oldLat, oldLng, currentLat, currentLng);

  app.logger.info(
    {
      vesselId,
      mmsi,
      positionChangeDegrees: Math.round(maxDiff * 10000) / 10000,
      distanceNauticalMiles: distanceNm,
      durationHours,
    },
    `Movement detected for vessel ${vessel_name}: ${distanceNm} nm (${Math.round(maxDiff * 10000) / 10000}°) over ${durationHours} hours`
  );

  // VALIDATION: Only create entries if vessel has traveled at least 0.5 nm
  if (distanceNm < 0.5) {
    app.logger.debug(
      { vesselId, mmsi, distanceNm, minimumThreshold: 0.5 },
      `Vessel ${vessel_name} has not traveled enough distance (${distanceNm} nm < 0.5 nm minimum), skipping entry creation`
    );
    return;
  }

  // VALIDATION: Reject implausible distances. A fast yacht does ~30 knots max;
  // in a 2-hour window that's ~60 nm. Allow generous headroom but reject
  // obviously bogus data (e.g., AIS returning 0,0 for one check).
  const MAX_PLAUSIBLE_DISTANCE_NM = 200;
  if (distanceNm > MAX_PLAUSIBLE_DISTANCE_NM) {
    app.logger.warn(
      { vesselId, mmsi, distanceNm, maxPlausible: MAX_PLAUSIBLE_DISTANCE_NM },
      `Vessel ${vessel_name} reported implausible distance (${distanceNm} nm > ${MAX_PLAUSIBLE_DISTANCE_NM} nm max), likely bad AIS data — skipping`
    );
    return;
  }

  // Get calendar day for the old check (start of this observation window)
  const calendarDay = getCalendarDay(oldCheck.check_time);

  app.logger.debug(
    { vesselId, mmsi, userId, calendarDay },
    `Checking for existing pending entry on calendar day ${calendarDay} for user ${userId}`
  );

  // Check if there's an existing PENDING sea time entry for this vessel on the same calendar day
  const existingEntries = await app.db
    .select()
    .from(schema.sea_time_entries)
    .where(
      and(
        eq(schema.sea_time_entries.vessel_id, vesselId),
        eq(schema.sea_time_entries.status, 'pending')
      )
    );

  // Filter for entries on the same calendar day
  const existingEntryForDay = existingEntries.find(entry => {
    const entryDay = getCalendarDay(entry.start_time);
    return entryDay === calendarDay;
  });

  if (existingEntryForDay) {
    // EXTEND the existing entry (amalgamate multiple detections)
    try {
      // Calculate total duration from original start_time to current check_time
      const totalDurationMs = currentCheck.check_time.getTime() - existingEntryForDay.start_time.getTime();
      const totalDurationHours = Math.round((totalDurationMs / (1000 * 60 * 60)) * 100) / 100;

      // VALIDATION: Check if total duration is 0 hours
      if (totalDurationHours === 0) {
        app.logger.debug(
          { vesselId, mmsi, userId, entryId: existingEntryForDay.id, totalDurationHours },
          `Skipping entry extension: total duration is 0 hours`
        );
        return;
      }

      // Calculate total distance from entry's original start position to current end position
      let totalDistance = 0;
      if (existingEntryForDay.start_latitude && existingEntryForDay.start_longitude) {
        const startLat = parseFloat(String(existingEntryForDay.start_latitude));
        const startLng = parseFloat(String(existingEntryForDay.start_longitude));
        // Calculate distance from original start to current end
        totalDistance = calculateDistanceNauticalMiles(startLat, startLng, currentLat, currentLng);
      }

      // VALIDATION: Check if vessel has traveled meaningful distance
      const isStationary = totalDistance < 0.5;

      // Determine MCA compliance based on total duration
      const isMCACompliant = totalDurationHours >= 4.0;

      // Update the existing entry with the new end position and time
      // Notes reflect the complete amalgamated movement across all detections
      const updatedNotes = `Movement detected: vessel moved ${totalDistance} nm over ${totalDurationHours} hours. Multiple detections amalgamated.`;

      const [updated_entry] = await app.db
        .update(schema.sea_time_entries)
        .set({
          end_time: currentCheck.check_time,
          end_latitude: String(currentLat),
          end_longitude: String(currentLng),
          duration_hours: String(totalDurationHours),
          mca_compliant: isMCACompliant,
          distance_nm: String(totalDistance),
          is_stationary: isStationary,
          notes: updatedNotes,
        })
        .where(eq(schema.sea_time_entries.id, existingEntryForDay.id))
        .returning();

      app.logger.info(
        {
          taskId,
          vesselId,
          mmsi,
          userId,
          entryId: existingEntryForDay.id,
          originalStartTime: existingEntryForDay.start_time.toISOString(),
          originalStartPosition: `(${existingEntryForDay.start_latitude}, ${existingEntryForDay.start_longitude})`,
          newEndTime: currentCheck.check_time.toISOString(),
          newEndPosition: `(${currentLat}, ${currentLng})`,
          previousDurationHours: existingEntryForDay.duration_hours ? parseFloat(String(existingEntryForDay.duration_hours)) : 0,
          newTotalDurationHours: totalDurationHours,
          mcaCompliant: isMCACompliant,
          totalDistanceNauticalMiles: totalDistance,
          detectionDistanceNm: distanceNm,
          positionChangeDegrees: Math.round(maxDiff * 10000) / 10000,
        },
        `Extended entry [${existingEntryForDay.id}] for vessel ${vessel_name}: now ${totalDurationHours} hours total (MCA compliant: ${isMCACompliant}). Start position: (${existingEntryForDay.start_latitude}, ${existingEntryForDay.start_longitude}) from ${existingEntryForDay.start_time.toISOString()}`
      );
    } catch (error) {
      app.logger.error(
        { err: error, vesselId, mmsi, userId, taskId, entryId: existingEntryForDay.id },
        `Failed to extend sea time entry for vessel ${vessel_name} (user: ${userId})`
      );
    }
  } else {
    // VALIDATION: Check if duration is 0 hours
    if (durationHours === 0) {
      app.logger.debug(
        { vesselId, mmsi, userId, durationHours },
        `Skipping entry creation: duration is 0 hours`
      );
      return;
    }

    // CREATE a new pending sea time entry
    const notes = `Movement detected: vessel moved ${distanceNm} nm (${Math.round(maxDiff * 10000) / 10000}°) over ${durationHours} hours`;

    // Determine MCA compliance based on duration
    const isMCACompliant = durationHours >= 4.0;

    // Determine if vessel is stationary (distance < 0.5 nm)
    const isStationary = distanceNm < 0.5;

    try {
      const [new_entry] = await app.db
        .insert(schema.sea_time_entries)
        .values({
          user_id: vessel.user_id,
          vessel_id: vesselId,
          start_time: oldCheck.check_time,
          end_time: currentCheck.check_time,
          duration_hours: String(durationHours),
          start_latitude: String(oldLat),
          start_longitude: String(oldLng),
          end_latitude: String(currentLat),
          end_longitude: String(currentLng),
          status: 'pending',
          service_type: 'actual_sea_service',
          mca_compliant: isMCACompliant,
          distance_nm: String(distanceNm),
          is_stationary: isStationary,
          notes: notes,
        })
        .returning();

      app.logger.info(
        {
          taskId,
          vesselId,
          mmsi,
          userId,
          entryId: new_entry.id,
          startTime: oldCheck.check_time.toISOString(),
          startPosition: `(${oldLat}, ${oldLng})`,
          endTime: currentCheck.check_time.toISOString(),
          endPosition: `(${currentLat}, ${currentLng})`,
          durationHours,
          mcaCompliant: isMCACompliant,
          distanceNauticalMiles: distanceNm,
          positionChangeDegrees: Math.round(maxDiff * 10000) / 10000,
          calendarDay,
        },
        `Created entry [${new_entry.id}] for vessel ${vessel_name}: ${durationHours} hours (MCA compliant: ${isMCACompliant}). Start position: (${oldLat}, ${oldLng}) from ${oldCheck.check_time.toISOString()}`
      );
    } catch (error) {
      app.logger.error(
        { err: error, vesselId, mmsi, userId, taskId },
        `Failed to create sea time entry for vessel ${vessel_name} (user: ${userId})`
      );
    }
  }
}
