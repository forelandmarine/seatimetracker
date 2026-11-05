import { pgTable, text, timestamp, uuid, integer, decimal, index } from 'drizzle-orm/pg-core';
import { sea_time_entries } from './schema.js';

// One row per live-tracked passage checked against the Datalastic AIS track once the
// vessel stopped (services/passageRefinement.ts). Keeps the times the live tracker
// recorded, so every change to a passage can be audited or undone.
export const passage_refinements = pgTable('passage_refinements', {
  entry_id: uuid('entry_id').primaryKey().references(() => sea_time_entries.id, { onDelete: 'cascade' }),
  // 'refined' | 'unchanged' | 'no_movement' | 'no_history' | 'timed_out' | 'skipped_low_credits'
  outcome: text('outcome').notNull(),
  original_start_time: timestamp('original_start_time').notNull(),
  original_end_time: timestamp('original_end_time'),
  refined_start_time: timestamp('refined_start_time'),
  refined_end_time: timestamp('refined_end_time'),
  original_duration_hours: decimal('original_duration_hours', { precision: 10, scale: 2 }),
  refined_duration_hours: decimal('refined_duration_hours', { precision: 10, scale: 2 }),
  positions_used: integer('positions_used').notNull().default(0),
  refined_at: timestamp('refined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('passage_refinements_outcome_idx').on(table.outcome),
]);
