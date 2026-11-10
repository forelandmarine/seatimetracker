-- Days abroad (2.5.0): Schengen 90/180 tracker and tax day counts. Two NEW tables,
-- nothing else touched. Additive and idempotent. Safe to run (and re-run) on the live
-- Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING: apply this BEFORE deploying the backend that adds backend/src/db/schema/presence.ts.
-- Railway runs SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).
--
-- presence_stays: where the crew member was and when, entered by hand (not from AIS).
-- kind 'ashore' = in the country; 'on_board' = signed on a vessel recorded against that
-- country ('ZZ' = at sea, international waters). Both dates inclusive, end_date null =
-- ongoing. Stays may share a boundary day but must not overlap (checked by the API).
CREATE TABLE IF NOT EXISTS presence_stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  country_code text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  kind text NOT NULL DEFAULT 'ashore',
  vessel_id uuid REFERENCES vessels(id) ON DELETE SET NULL,
  counts_schengen boolean NOT NULL DEFAULT true,
  counts_tax boolean NOT NULL DEFAULT true,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_stays_dates_chk CHECK (end_date IS NULL OR start_date <= end_date),
  CONSTRAINT presence_stays_kind_chk CHECK (kind IN ('ashore', 'on_board')),
  CONSTRAINT presence_stays_country_chk CHECK (country_code ~ '^[A-Z]{2}$')
);
CREATE INDEX IF NOT EXISTS presence_stays_user_start_idx ON presence_stays (user_id, start_date);

-- One row per user: the countries whose tax day counts they want to see.
CREATE TABLE IF NOT EXISTS presence_settings (
  user_id text PRIMARY KEY,
  tax_countries text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- New public tables: RLS on with no policies (see 2026-10-27_enable_rls_remaining_tables.sql).
-- The backend connects as postgres and bypasses RLS.
ALTER TABLE public.presence_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presence_settings ENABLE ROW LEVEL SECURITY;

-- Check: SELECT count(*) FROM presence_stays;  (0 on first run)
-- Rollback: DROP TABLE IF EXISTS presence_stays; DROP TABLE IF EXISTS presence_settings;
