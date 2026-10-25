-- Vessel identity history: MMSI, name, flag and call sign changes (2.3.0).
-- Additive, nullable, idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the code that adds these columns and
-- the table to backend/src/db/schema/schema.ts. Drizzle names every schema column in its
-- SELECTs, so deploying first would break every vessel read. Railway runs with
-- SKIP_MIGRATIONS=true, so this is applied by hand.
--
-- ais_name / ais_flag: the last name and flag AIS reported (changes are detected against
-- these, not against the user's own spelling). pending_name: a new AIS name awaiting the
-- user's OK. vessel_identity_changes: dated history used by reports.
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS ais_name text;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS ais_flag text;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS pending_name text;
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS pending_name_since date;

CREATE TABLE IF NOT EXISTS vessel_identity_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vessel_id uuid NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  effective_date date NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vessel_identity_changes_vessel_id_idx ON vessel_identity_changes (vessel_id);
