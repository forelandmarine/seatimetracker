import { pgTable, text, timestamp, uuid, boolean, decimal, index, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const vessels = pgTable('vessels', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'), // User ownership - required for data sandboxing (nullable for backward compatibility with existing data)
  mmsi: text('mmsi').notNull(), // Removed global unique constraint to allow multiple users to track the same MMSI
  vessel_name: text('vessel_name').notNull(),
  callsign: text('callsign'), // Radio callsign from AIS data
  flag: text('flag'),
  official_number: text('official_number'),
  type: text('type'), // 'Motor' or 'Sail'
  length_metres: decimal('length_metres', { precision: 8, scale: 2 }),
  gross_tonnes: decimal('gross_tonnes', { precision: 10, scale: 2 }),
  engine_kilowatts: decimal('engine_kilowatts', { precision: 10, scale: 2 }), // Engine power in kilowatts
  engine_type: text('engine_type'), // Engine type (e.g., Diesel, Petrol, Electric, Hybrid)
  is_active: boolean('is_active').notNull().default(false),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('vessels_user_id_idx').on(table.user_id),
  index('vessels_mmsi_idx').on(table.mmsi),
  index('vessels_is_active_idx').on(table.is_active),
  // Composite unique constraint: user_id + mmsi (allows same MMSI for different users, but not for same user)
  uniqueIndex('vessels_user_id_mmsi_uq').on(table.user_id, table.mmsi),
]);

export const sea_time_entries = pgTable('sea_time_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'), // User ownership - required for data sandboxing (nullable for backward compatibility with existing data)
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
  start_time: timestamp('start_time').notNull(),
  end_time: timestamp('end_time'),
  duration_hours: decimal('duration_hours', { precision: 10, scale: 2 }), // Deprecated - kept for backward compatibility
  sea_days: integer('sea_days'), // Sea days count (1 for confirmed entries, null for pending/rejected)
  status: text('status').notNull().default('pending'),
  service_type: text('service_type').default('actual_sea_service'), // Service type: actual_sea_service, watchkeeping_service, standby_service, yard_service, service_in_port
  notes: text('notes'),
  start_latitude: decimal('start_latitude', { precision: 9, scale: 6 }),
  start_longitude: decimal('start_longitude', { precision: 10, scale: 6 }),
  end_latitude: decimal('end_latitude', { precision: 9, scale: 6 }),
  end_longitude: decimal('end_longitude', { precision: 10, scale: 6 }),
  mca_compliant: boolean('mca_compliant'), // true = meets 4hr requirement, false = 2-4hr detection, null = legacy
  detection_window_hours: decimal('detection_window_hours', { precision: 10, scale: 2 }), // Actual movement detection window duration
  watchkeeping_hours: decimal('watchkeeping_hours', { precision: 10, scale: 2 }), // Watchkeeping hours (accumulated across days, 4hrs = 1 day)
  additional_watchkeeping_hours: decimal('additional_watchkeeping_hours', { precision: 10, scale: 2 }), // Additional watchkeeping at anchor/mooring (engineering only)
  is_stationary: boolean('is_stationary'), // Whether vessel is stationary (at anchor or moored) for this entry
  distance_nm: decimal('distance_nm', { precision: 10, scale: 2 }), // Distance traveled in nautical miles (calculated from start/end coordinates)
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('sea_time_entries_user_id_idx').on(table.user_id),
  index('sea_time_entries_vessel_id_idx').on(table.vessel_id),
  index('sea_time_entries_status_idx').on(table.status),
  index('sea_time_entries_service_type_idx').on(table.service_type),
  index('sea_time_entries_mca_compliant_idx').on(table.mca_compliant),
]);

export const ais_checks = pgTable('ais_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'), // User ownership - required for data sandboxing (nullable for backward compatibility with existing data)
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
  check_time: timestamp('check_time').notNull(),
  is_moving: boolean('is_moving').notNull(),
  speed_knots: decimal('speed_knots', { precision: 8, scale: 2 }),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 10, scale: 6 }),
  api_source: text('api_source').default('myshiptracking'), // Track which API provided the data
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('ais_checks_user_id_idx').on(table.user_id),
  index('ais_checks_vessel_time_idx').on(table.vessel_id, table.check_time),
]);

export const vesselsRelations = relations(vessels, ({ many }) => ({
  sea_time_entries: many(sea_time_entries),
  ais_checks: many(ais_checks),
}));

export const sea_time_entriesRelations = relations(sea_time_entries, ({ one }) => ({
  vessel: one(vessels, {
    fields: [sea_time_entries.vessel_id],
    references: [vessels.id],
  }),
}));

export const ais_checksRelations = relations(ais_checks, ({ one }) => ({
  vessel: one(vessels, {
    fields: [ais_checks.vessel_id],
    references: [vessels.id],
  }),
}));

export const ais_debug_logs = pgTable('ais_debug_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'), // User ownership - required for data sandboxing (nullable for backward compatibility with existing data)
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
  mmsi: text('mmsi').notNull(),
  api_url: text('api_url').notNull(),
  request_time: timestamp('request_time').notNull(),
  response_status: text('response_status').notNull(),
  response_body: text('response_body'),
  authentication_status: text('authentication_status').notNull(),
  error_message: text('error_message'),
  api_source: text('api_source'), // Track which API provided the data (myshiptracking, base44, failed)
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('ais_debug_logs_user_id_idx').on(table.user_id),
  index('ais_debug_logs_vessel_request_time_idx').on(table.vessel_id, table.request_time),
  index('ais_debug_logs_mmsi_request_idx').on(table.mmsi),
]);

export const scheduled_tasks = pgTable('scheduled_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'), // User ownership - required for data sandboxing (nullable for backward compatibility with existing data)
  task_type: text('task_type').notNull(), // e.g., 'ais_check'
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
  interval_hours: text('interval_hours').notNull(),
  last_run: timestamp('last_run'),
  next_run: timestamp('next_run').notNull(),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('scheduled_tasks_user_id_idx').on(table.user_id),
  index('scheduled_tasks_vessel_task_idx').on(table.vessel_id, table.task_type),
  index('scheduled_tasks_next_run_task_idx').on(table.next_run),
  index('scheduled_tasks_active_idx').on(table.is_active),
]);

export const notification_schedules = pgTable('notification_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(), // User ownership - required for data sandboxing
  notification_type: text('notification_type').notNull(), // e.g., 'daily_sea_time_review'
  scheduled_time: text('scheduled_time').notNull(), // Time in HH:MM format (e.g., '18:00')
  timezone: text('timezone').notNull(), // User's timezone (e.g., 'Europe/London', 'America/New_York')
  is_active: boolean('is_active').notNull().default(true),
  last_sent: timestamp('last_sent'), // Last time notification was sent
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('notification_schedules_user_id_idx').on(table.user_id),
  index('notification_schedules_active_idx').on(table.is_active),
  index('notification_schedules_user_active_idx').on(table.user_id, table.is_active),
]);

export const ais_query_timestamps = pgTable('ais_query_timestamps', {
  id: uuid('id').primaryKey().defaultRandom(),
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }).unique(),
  last_query_time: timestamp('last_query_time').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('ais_query_timestamps_vessel_id_idx').on(table.vessel_id),
  index('ais_query_timestamps_last_query_time_idx').on(table.last_query_time),
]);

export const ais_debug_logsRelations = relations(ais_debug_logs, ({ one }) => ({
  vessel: one(vessels, {
    fields: [ais_debug_logs.vessel_id],
    references: [vessels.id],
  }),
}));

export const scheduled_tasksRelations = relations(scheduled_tasks, ({ one }) => ({
  vessel: one(vessels, {
    fields: [scheduled_tasks.vessel_id],
    references: [vessels.id],
  }),
}));

export const ais_query_timestampsRelations = relations(ais_query_timestamps, ({ one }) => ({
  vessel: one(vessels, {
    fields: [ais_query_timestamps.vessel_id],
    references: [vessels.id],
  }),
}));
