import { pgTable, uuid, text, date, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Upcoming course dates read from training providers' published calendars
// (2.4.0 "Find a course"). provider_id matches the app's bundled directory.
// Rebuilt per provider by services/courseDates.ts; see manual migration
// 2026-10-27_training_course_dates.sql.
export const training_course_dates = pgTable('training_course_dates', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider_id: text('provider_id').notNull(),
  course_code: text('course_code').notNull(),
  start_date: date('start_date').notNull(),
  end_date: date('end_date'),
  price_text: text('price_text'),
  availability_text: text('availability_text'),
  booking_url: text('booking_url'),
  source_url: text('source_url'),
  fetched_at: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('training_course_dates_provider_idx').on(table.provider_id),
  index('training_course_dates_course_idx').on(table.course_code, table.start_date),
  uniqueIndex('training_course_dates_uq').on(table.provider_id, table.course_code, table.start_date),
]);

// One row per provider refresh, so failures are visible without reading logs.
export const training_date_sources = pgTable('training_date_sources', {
  provider_id: text('provider_id').primaryKey(),
  dates_url: text('dates_url').notNull(),
  parser: text('parser').notNull(),
  last_run_at: timestamp('last_run_at', { withTimezone: true }),
  last_ok_at: timestamp('last_ok_at', { withTimezone: true }),
  last_count: text('last_count'),
  last_error: text('last_error'),
});
