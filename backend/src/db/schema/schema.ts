import { pgTable, text, timestamp, uuid, boolean, decimal, index, integer, uniqueIndex, date } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const vessels = pgTable('vessels', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'), // User ownership - required for data sandboxing (nullable for backward compatibility with existing data)
  mmsi: text('mmsi').notNull(), // Removed global unique constraint to allow multiple users to track the same MMSI
  vessel_name: text('vessel_name').notNull(),
  imo_number: text('imo_number'), // IMO number (required by most maritime authorities alongside MMSI)
  callsign: text('callsign'), // Radio callsign from AIS data
  flag: text('flag'),
  official_number: text('official_number'),
  type: text('type'), // 'Motor' or 'Sail'
  length_metres: decimal('length_metres', { precision: 8, scale: 2 }),
  gross_tonnes: decimal('gross_tonnes', { precision: 10, scale: 2 }),
  tonnage_itc: decimal('tonnage_itc', { precision: 10, scale: 2 }), // International Tonnage Convention measurement (USCG)
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
  // Officer rank/capacity for this entry (e.g., Master, Chief Officer, OOW, Chief Engineer)
  rank: text('rank'),
  // Date joined / left vessel (distinct from voyage start/end - represents sign-on period)
  date_joined: date('date_joined'),
  date_left: date('date_left'),
  // Trade area classification
  trade_area: text('trade_area'), // 'unlimited', 'near_coastal', 'coastal', 'inland'
  // Watchkeeping breakdown by watch type
  bridge_watch_hours: decimal('bridge_watch_hours', { precision: 10, scale: 2 }), // Bridge/navigation watch hours (deck)
  engine_watch_hours: decimal('engine_watch_hours', { precision: 10, scale: 2 }), // Engine room watch hours (engineering)
  // Certificate held during this service period
  certificate_id: uuid('certificate_id').references(() => certificates.id, { onDelete: 'set null' }),
  // Voyage detail fields (Sprint 6)
  from_port: text('from_port'),
  to_port: text('to_port'),
  cargo_type: text('cargo_type'),
  signature_image: text('signature_image'), // Base64 PNG of user's signature for this entry's testimonial
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('sea_time_entries_user_id_idx').on(table.user_id),
  index('sea_time_entries_vessel_id_idx').on(table.vessel_id),
  index('sea_time_entries_status_idx').on(table.status),
  index('sea_time_entries_service_type_idx').on(table.service_type),
  index('sea_time_entries_mca_compliant_idx').on(table.mca_compliant),
  index('sea_time_entries_from_port_idx').on(table.from_port),
  index('sea_time_entries_to_port_idx').on(table.to_port),
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
  course: decimal('course', { precision: 6, scale: 2 }), // Course over ground in degrees
  heading: decimal('heading', { precision: 6, scale: 2 }), // True heading in degrees
  nav_status: text('nav_status'), // AIS navigation status (e.g. "Under way using engine", "At anchor")
  destination: text('destination'), // Reported destination
  eta: text('eta'), // Estimated time of arrival (raw string from AIS)
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
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
  user_id: text('user_id'), // User ownership for per-user rate limiting
  last_query_time: timestamp('last_query_time').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('ais_query_timestamps_vessel_id_idx').on(table.vessel_id),
  index('ais_query_timestamps_last_query_time_idx').on(table.last_query_time),
  uniqueIndex('ais_query_timestamps_vessel_user_uq').on(table.vessel_id, table.user_id),
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

// Leave periods — tracks time off during vessel service (required by MCA, USCG testimonial forms)
export const leave_periods = pgTable('leave_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  vessel_id: uuid('vessel_id').references(() => vessels.id, { onDelete: 'set null' }),
  start_date: date('start_date').notNull(),
  end_date: date('end_date').notNull(),
  reason: text('reason'), // 'annual_leave', 'sick_leave', 'personal', 'training', 'other'
  notes: text('notes'),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('leave_periods_user_id_idx').on(table.user_id),
  index('leave_periods_vessel_id_idx').on(table.vessel_id),
]);

// Maritime certificates: STCW, ENG1, GMDSS, ECDIS, etc.
// Tracks expiry dates so we can send reminders.
export const certificates = pgTable('certificates', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  certificate_type: text('certificate_type').notNull(), // 'stcw_basic_safety', 'eng1', 'gmdss_goc', etc.
  certificate_number: text('certificate_number'),
  issuing_body: text('issuing_body'),
  issued_date: date('issued_date'),
  expiry_date: date('expiry_date'),
  notes: text('notes'),
  image_url: text('image_url'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index('certificates_user_id_idx').on(table.user_id),
  expiryDateIdx: index('certificates_expiry_date_idx').on(table.expiry_date),
  typeIdx: index('certificates_certificate_type_idx').on(table.certificate_type),
}));
