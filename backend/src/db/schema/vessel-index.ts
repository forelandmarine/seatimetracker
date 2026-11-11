import { pgTable, uuid, text, decimal, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';

// Vessel lookup (2.5.0). Our own index of vessels and their MMSIs, so Add Vessel
// search never has to call Datalastic (which bills per row returned). Filled from
// vessels users have added (scripts/seed-vessel-index.ts), from web-search results
// (source 'web', unconfirmed) and from the one Datalastic vessel_info call made
// when a user confirms a match (source 'datalastic', last_confirmed_at set).
// name_norm = utils/vesselLookup normaliseVesselName(name). See manual migration
// 2026-11-11_vessel_index.sql. The backend copes if that SQL is not applied yet.
export const vessel_index = pgTable('vessel_index', {
  id: uuid('id').primaryKey().defaultRandom(),
  mmsi: text('mmsi').notNull(),
  imo: text('imo'),
  name: text('name').notNull(),
  name_norm: text('name_norm').notNull(),
  call_sign: text('call_sign'),
  flag_iso: text('flag_iso'),
  flag: text('flag'),
  type: text('type'),
  length_m: decimal('length_m', { precision: 8, scale: 2 }),
  year_built: text('year_built'),
  former_names: text('former_names').array().notNull().default([]),
  source: text('source').notNull(), // 'vessels' | 'web' | 'datalastic'
  source_url: text('source_url'),
  last_confirmed_at: timestamp('last_confirmed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('vessel_index_mmsi_key').on(table.mmsi),
  index('vessel_index_imo_idx').on(table.imo),
]);

// Searches that found nothing, so we can see which vessels people can't find.
export const vessel_lookup_misses = pgTable('vessel_lookup_misses', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id'),
  name: text('name').notNull(),
  length: decimal('length', { precision: 8, scale: 2 }),
  unit: text('unit'),
  web_searched: text('web_searched'), // 'yes' | 'no' | 'capped' | 'off'
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('vessel_lookup_misses_created_idx').on(table.created_at),
]);
