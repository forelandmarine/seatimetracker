-- Testimonial signature requests (release after 2.5.0): the Master or company completes and
-- signs an MGN 496 Annex C workboat testimonial from a one-time link the seafarer shares.
-- Additive, idempotent. Safe to run (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the backend that adds
-- backend/src/db/schema/testimonial-requests.ts. Railway runs with SKIP_MIGRATIONS=true, so
-- this is applied by hand. Without the table the request and sign routes fail with a 500;
-- the testimonial PDF itself still works (it skips signed requests if the read fails).
--
-- token_hash is the SHA-256 (hex) of the link token; the token itself is never stored.
-- part1 is the Part 1 figures frozen when the request was made.
CREATE TABLE IF NOT EXISTS testimonial_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  vessel_id uuid NOT NULL REFERENCES vessels(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  part1 jsonb NOT NULL,
  company_name text,
  company_address text,
  company_phone text,
  company_email text,
  duties text,
  conduct text,
  ability text,
  signer_name text,
  signer_position text,
  signer_coc_no text,
  signer_issuing_admin text,
  signer_organisation text,
  signer_org_position text,
  signature_image text,
  signed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT testimonial_requests_status_chk CHECK (status IN ('pending', 'signed', 'cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS testimonial_requests_token_hash_uq ON testimonial_requests (token_hash);
CREATE INDEX IF NOT EXISTS testimonial_requests_user_id_idx ON testimonial_requests (user_id);
CREATE INDEX IF NOT EXISTS testimonial_requests_vessel_id_idx ON testimonial_requests (vessel_id);

-- New public table: RLS on with no policies (see 2026-10-27_enable_rls_remaining_tables.sql).
-- The backend connects as postgres and bypasses RLS.
ALTER TABLE public.testimonial_requests ENABLE ROW LEVEL SECURITY;

-- Check: SELECT count(*) FROM testimonial_requests;  (0 on first run)
-- Rollback: DROP TABLE IF EXISTS testimonial_requests;
