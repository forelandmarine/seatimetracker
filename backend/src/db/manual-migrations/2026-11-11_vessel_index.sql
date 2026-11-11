-- Vessel lookup redesign (2.5.0): our own vessel index so Add Vessel search never
-- calls Datalastic, plus a log of searches that found nothing. Two NEW tables and
-- the pg_trgm extension, nothing else touched. Additive and idempotent: safe to run
-- (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING: NOT required before deploying the backend. Without these tables the
-- lookup still searches the vessels table and the web, logs a warning, and simply
-- doesn't save to the index or log misses. Apply it to switch those on.
-- Railway runs SKIP_MIGRATIONS=true, so apply by hand. Then, optionally, seed the
-- index from existing vessels: backend/scripts/seed-vessel-index.ts (dry run first).

-- Fuzzy name matching. Supabase allows this extension. If it can't be created the
-- backend falls back to plain ILIKE matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS vessel_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mmsi text NOT NULL,
  imo text,
  name text NOT NULL,
  name_norm text NOT NULL,
  call_sign text,
  flag_iso text,
  flag text,
  type text,
  length_m numeric(8, 2),
  year_built text,
  former_names text[] NOT NULL DEFAULT '{}',
  source text NOT NULL,
  source_url text,
  last_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vessel_index_source_chk CHECK (source IN ('vessels', 'web', 'datalastic')),
  CONSTRAINT vessel_index_mmsi_chk CHECK (mmsi ~ '^[0-9]{9}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS vessel_index_mmsi_key ON vessel_index (mmsi);
CREATE INDEX IF NOT EXISTS vessel_index_imo_idx ON vessel_index (imo);
CREATE INDEX IF NOT EXISTS vessel_index_name_norm_idx ON vessel_index (name_norm text_pattern_ops);

-- Trigram index for similarity() and '%x%' matching. Skipped quietly if pg_trgm is missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS vessel_index_name_trgm_idx ON vessel_index USING gin (name_norm gin_trgm_ops)';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS vessel_lookup_misses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  name text NOT NULL,
  length numeric(8, 2),
  unit text,
  web_searched text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vessel_lookup_misses_created_idx ON vessel_lookup_misses (created_at);

-- Row level security on, no policies: only the backend (service role) reads and writes.
ALTER TABLE vessel_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE vessel_lookup_misses ENABLE ROW LEVEL SECURITY;
