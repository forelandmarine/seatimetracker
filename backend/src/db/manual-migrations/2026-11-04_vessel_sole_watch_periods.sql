-- Sole watchkeeper periods (2.5.0): dated periods replace the single vessels.is_sole_watchkeeper flag.
-- Additive, idempotent. Safe to run (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the backend that adds
-- vessel_sole_watch_periods to backend/src/db/schema/schema.ts. Railway runs with
-- SKIP_MIGRATIONS=true, so this is applied by hand. (The backend falls back to the old flag
-- if the table is missing, but apply it first anyway.)
--
-- An actual sea service entry whose UTC date falls inside a period also counts as a
-- watchkeeping day. start_date null = from the first entry on the vessel. end_date null =
-- ongoing. Both ends are inclusive. Periods on the same vessel must not overlap (checked by
-- the API).
--
-- vessels.is_sole_watchkeeper stays for old app builds. The backend keeps it true while a
-- period covers today.
CREATE TABLE IF NOT EXISTS vessel_sole_watch_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  user_id text,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessel_sole_watch_periods_dates_chk
    CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS vessel_sole_watch_periods_vessel_id_idx ON vessel_sole_watch_periods (vessel_id);
CREATE INDEX IF NOT EXISTS vessel_sole_watch_periods_user_id_idx ON vessel_sole_watch_periods (user_id);

-- New public table: RLS on with no policies (see 2026-10-27_enable_rls_remaining_tables.sql).
-- The backend connects as postgres and bypasses RLS.
ALTER TABLE public.vessel_sole_watch_periods ENABLE ROW LEVEL SECURITY;

-- Backfill: every vessel already flagged gets one open period with no start date, so its
-- totals do not change. Skips vessels that already have a period (re-run safe).
INSERT INTO vessel_sole_watch_periods (vessel_id, user_id, start_date, end_date)
SELECT v.id, v.user_id, NULL, NULL
FROM vessels v
WHERE v.is_sole_watchkeeper = true
  AND NOT EXISTS (SELECT 1 FROM vessel_sole_watch_periods p WHERE p.vessel_id = v.id);

-- Check: SELECT count(*) FROM vessels WHERE is_sole_watchkeeper = true;
--        SELECT count(*) FROM vessel_sole_watch_periods;  (should match on first run)
-- Rollback: DROP TABLE IF EXISTS vessel_sole_watch_periods;  (the flag column is untouched)
