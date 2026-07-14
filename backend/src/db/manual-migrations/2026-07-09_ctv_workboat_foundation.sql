-- CTV / Workboat expansion — Sprint 1 foundation columns
-- Additive, nullable, idempotent. Safe to run on the live Supabase DB.
--
-- HOW TO APPLY:
--   Preferred: run `npx drizzle-kit generate` in backend/ (it will produce the
--   canonical timestamped migration matching schema/schema.ts) and apply it via
--   your normal Supabase migration flow. This file is a hand-written reference
--   equivalent for applying directly in the Supabase SQL editor if needed.
--
-- Matches columns added to backend/src/db/schema/schema.ts.

ALTER TABLE "vessels"
  ADD COLUMN IF NOT EXISTS "is_workboat" boolean,
  ADD COLUMN IF NOT EXISTS "is_high_speed" boolean;

ALTER TABLE "sea_time_entries"
  ADD COLUMN IF NOT EXISTS "area_category" text,
  ADD COLUMN IF NOT EXISTS "is_tidal" boolean,
  ADD COLUMN IF NOT EXISTS "dual_capacity" boolean;
