import { pgTable, text, timestamp, uuid, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { vessels } from './schema.js';

// A request for the Master or company to complete and sign one MGN 496 Annex C
// testimonial. The seafarer shares a one-time link; only the SHA-256 of its token
// is stored. part1 is the Part 1 figures as they stood when the request was made,
// so the signatory signs exactly what they were shown.
// See routes/testimonialRequests.ts and manual-migrations/2026-11-05_testimonial_requests.sql.
export const testimonial_requests = pgTable('testimonial_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: text('user_id').notNull(),
  vessel_id: uuid('vessel_id').notNull().references(() => vessels.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull(),
  status: text('status').notNull().default('pending'), // 'pending' | 'signed' | 'cancelled'
  part1: jsonb('part1').notNull(), // TestimonialSnapshot
  company_name: text('company_name'),
  company_address: text('company_address'),
  company_phone: text('company_phone'),
  company_email: text('company_email'),
  duties: text('duties'),
  conduct: text('conduct'),
  ability: text('ability'),
  signer_name: text('signer_name'),
  signer_position: text('signer_position'), // 'master' | 'responsible_person'
  signer_coc_no: text('signer_coc_no'),
  signer_issuing_admin: text('signer_issuing_admin'),
  signer_organisation: text('signer_organisation'),
  signer_org_position: text('signer_org_position'),
  signature_image: text('signature_image'), // data:image/png;base64
  signed_at: timestamp('signed_at', { withTimezone: true }),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('testimonial_requests_token_hash_uq').on(table.token_hash),
  index('testimonial_requests_user_id_idx').on(table.user_id),
  index('testimonial_requests_vessel_id_idx').on(table.vessel_id),
]);
