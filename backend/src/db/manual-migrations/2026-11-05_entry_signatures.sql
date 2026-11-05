-- Per-entry signatures (release after 2.5.0): the Master or a responsible person signs one
-- sea time entry, on the seafarer's phone or from a one-time link the seafarer shares.
-- Additive, idempotent. Safe to run (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the backend that adds the signature_*
-- columns to backend/src/db/schema/schema.ts. Railway runs with SKIP_MIGRATIONS=true, so this
-- is applied by hand. Drizzle selects every column of sea_time_entries, so without these
-- columns EVERY sea time read fails, not only signing.
--
-- signature_image already exists (nothing wrote it before this release).
-- signature_fingerprint is vessel|start|end|service_type as signed: a signature whose
-- fingerprint no longer matches the entry does not count.
ALTER TABLE sea_time_entries ADD COLUMN IF NOT EXISTS signature_signer_name text;
ALTER TABLE sea_time_entries ADD COLUMN IF NOT EXISTS signature_signer_capacity text;
ALTER TABLE sea_time_entries ADD COLUMN IF NOT EXISTS signature_signed_at timestamptz;
ALTER TABLE sea_time_entries ADD COLUMN IF NOT EXISTS signature_method text;
ALTER TABLE sea_time_entries ADD COLUMN IF NOT EXISTS signature_fingerprint text;

-- token_hash is the SHA-256 (hex) of the link token; the token itself is never stored.
-- snapshot is the entry as the signer is shown it, frozen when the link was made.
CREATE TABLE IF NOT EXISTS entry_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  entry_id uuid NOT NULL REFERENCES sea_time_entries(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  snapshot jsonb NOT NULL,
  fingerprint text NOT NULL,
  signer_name text,
  signed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entry_signature_requests_status_chk CHECK (status IN ('pending', 'signed', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS entry_signature_requests_token_hash_uq ON entry_signature_requests (token_hash);
CREATE INDEX IF NOT EXISTS entry_signature_requests_user_id_idx ON entry_signature_requests (user_id);
CREATE INDEX IF NOT EXISTS entry_signature_requests_entry_id_idx ON entry_signature_requests (entry_id);

-- New public table: RLS on with no policies (see 2026-10-27_enable_rls_remaining_tables.sql).
-- The backend connects as postgres and bypasses RLS.
ALTER TABLE public.entry_signature_requests ENABLE ROW LEVEL SECURITY;

-- Check: SELECT column_name FROM information_schema.columns
--          WHERE table_name = 'sea_time_entries' AND column_name LIKE 'signature%';  (6 rows)
--        SELECT count(*) FROM entry_signature_requests;  (0 on first run)
-- Rollback (only after rolling the backend back):
--   DROP TABLE IF EXISTS entry_signature_requests;
--   ALTER TABLE sea_time_entries DROP COLUMN IF EXISTS signature_signer_name,
--     DROP COLUMN IF EXISTS signature_signer_capacity, DROP COLUMN IF EXISTS signature_signed_at,
--     DROP COLUMN IF EXISTS signature_method, DROP COLUMN IF EXISTS signature_fingerprint;
