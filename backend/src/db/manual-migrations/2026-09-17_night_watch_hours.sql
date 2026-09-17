-- Night watch hours on sea-time entries — tracked separately from bridge/engine watch.
-- Additive, nullable, idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- Requested by a commercial CTV user who works night shifts and needs night-watch
-- hours recorded and totalled separately. Informational: it does not change day
-- counting, it is surfaced in reports and totals alongside bridge/engine watch hours.
--
-- ORDERING: apply BEFORE deploying the code that adds night_watch_hours to
-- schema.ts (Drizzle enumerates schema columns in SELECTs). Nullable, no default,
-- so applying early is invisible to the running app until the new code ships.

ALTER TABLE "sea_time_entries"
  ADD COLUMN IF NOT EXISTS "night_watch_hours" numeric(10, 2);
