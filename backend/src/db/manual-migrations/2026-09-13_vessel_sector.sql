-- Vessel sector (yachting / commercial) — user-facing profile preference.
-- Additive, nullable, idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- WHY HAND-WRITTEN (not drizzle-kit generate): the drizzle meta snapshots in
-- backend/drizzle/ are out of sync with the live database, so `drizzle-kit generate`
-- emits a migration that re-creates existing tables/columns and would fail on prod.
-- Apply this idempotent SQL directly (Supabase SQL editor, or psql "$DATABASE_URL" -f).
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the code that adds vessel_sector
-- to auth-schema.ts. Drizzle enumerates every schema column in its SELECTs (no SELECT *),
-- so deploying the new schema against a DB without this column would break profile reads.
-- The column is nullable with no default, so applying it early is invisible to the
-- running app until the new code ships.
--
-- Matches the column added to backend/src/db/auth-schema.ts (user table).
-- Unlike the CTV/workboat classification columns, this one is NOT gated behind
-- COMMERCIAL_PATHWAYS_ENABLED — it is a live, user-set preference shipped with the app.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "vessel_sector" text;  -- 'yachting' | 'commercial' (null = not yet chosen, treated as yachting)
