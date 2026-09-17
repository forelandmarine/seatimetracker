-- CTV / Workboat expansion — per-fix classification storage + engine reserve
-- Additive, nullable, idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- WHY HAND-WRITTEN (not drizzle-kit generate): the drizzle meta snapshots in
-- backend/drizzle/ are out of sync with the live database (schema has evolved via
-- Supabase / the maritime_compliance migration), so `drizzle-kit generate` emits a
-- migration that re-creates existing tables/columns and would fail on prod. Until the
-- snapshots are reconciled, apply classification columns via this idempotent SQL.
--
-- HOW TO APPLY (code-only handoff — run yourself against Supabase):
--   Paste into the Supabase SQL editor, or psql "$DATABASE_URL" -f this file.
--   Every statement is guarded with IF NOT EXISTS, so partial/duplicate runs are safe.
--
-- Matches columns added to backend/src/db/schema/schema.ts.
-- Gated in code behind COMMERCIAL_PATHWAYS_ENABLED — until that flag is 'true',
-- nothing writes to these columns and existing rows stay null.

-- Per-fix AIS-derived classification, written at ingest (routes/ais.ts / scheduler.ts).
ALTER TABLE "ais_checks"
  ADD COLUMN IF NOT EXISTS "area_category" text,   -- MSN 1837 categorised water: 'A'|'B'|'C'|'D' (null = at sea / not categorised)
  ADD COLUMN IF NOT EXISTS "is_tidal" boolean,     -- tidal waters at this fix
  ADD COLUMN IF NOT EXISTS "season" text;          -- season used for the Cat-D limit: 'summer'|'winter'

-- Aggregate + engine reserve on the sea-time entry.
-- (area_category, is_tidal, dual_capacity added by 2026-07-09_ctv_workboat_foundation.sql.)
ALTER TABLE "sea_time_entries"
  ADD COLUMN IF NOT EXISTS "is_categorised_water" boolean, -- any classified fix fell in MSN 1837 categorised waters (A-D)
  ADD COLUMN IF NOT EXISTS "qualifying_service" jsonb;     -- per-pathway qualifying result (see utils/pathways/); indicative until MCA/TSN
