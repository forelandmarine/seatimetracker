import { pgTable, text, timestamp, uuid, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { sea_time_entries } from './schema.js';

// A one-time link for the Master or a responsible person to sign one sea time
// entry. Only the SHA-256 of the token is stored. snapshot is the entry as the
// signer is shown it; fingerprint is what it covers (see utils/entrySignature.ts),
// so a link made before the entry was edited cannot be signed.
// See routes/entrySignatures.ts and manual-migrations/2026-11-05_entry_signatures.sql.
export const entry_signature_requests = pgTable('entry_signature_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  entry_id: uuid('entry_id').notNull().references(() => sea_time_entries.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'signed' | 'cancelled'
  snapshot: jsonb('snapshot').notNull(), // EntrySnapshot
  fingerprint: text('fingerprint').notNull(),
  signer_name: text('signer_name'),
  signed_at: timestamp('signed_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('entry_signature_requests_token_hash_uq').on(table.token_hash),
  index('entry_signature_requests_user_id_idx').on(table.user_id),
  index('entry_signature_requests_entry_id_idx').on(table.entry_id),
]);
