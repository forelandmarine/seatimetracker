import { pgTable, uuid, text, date, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { vessels } from './schema.js';

// Days abroad (2.5.0). Where the crew member was and when, entered by hand: ashore
// in a country, or signed on a vessel recorded against a country ('ZZ' = at sea,
// international waters). Feeds the Schengen 90/180 tracker and per-country tax day
// counts (utils/presence). Not derived from AIS. Both dates inclusive; end_date null =
// ongoing. Stays may share a boundary day but not overlap (checked by the API).
// See manual migration 2026-11-10_presence_stays.sql.
export const presence_stays = pgTable('presence_stays', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  country_code: text('country_code').notNull(), // ISO 3166-1 alpha-2, upper case
  start_date: date('start_date').notNull(),
  end_date: date('end_date'), // null = ongoing
  kind: text('kind').notNull().default('ashore'), // 'ashore' | 'on_board'
  vessel_id: uuid('vessel_id').references(() => vessels.id, { onDelete: 'set null' }),
  counts_schengen: boolean('counts_schengen').notNull().default(true), // on_board only; ashore always counts
  counts_tax: boolean('counts_tax').notNull().default(true), // false = left out of tax day counts
  note: text('note'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('presence_stays_user_start_idx').on(table.user_id, table.start_date),
]);

// One row per user: which countries' tax day counts they want to see.
export const presence_settings = pgTable('presence_settings', {
  user_id: text('user_id').primaryKey(),
  tax_countries: text('tax_countries').array().notNull().default([]),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
