-- Certificate discipline (Yachtmaster gaps): 'sail' or 'power' on RYA Yachtmaster
-- certificates, so a Yachtmaster in the other discipline can reduce the RYA
-- pre-exam sea time targets (utils/ryaService.ts). Additive, idempotent. Safe to
-- run (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the backend that adds
-- certificates.discipline to backend/src/db/schema/schema.ts. Railway runs with
-- SKIP_MIGRATIONS=true, so this is applied by hand. Every certificates query
-- selects the new column, so without it the certificates screen fails.
ALTER TABLE certificates ADD COLUMN IF NOT EXISTS discipline text;
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_discipline_check;
ALTER TABLE certificates ADD CONSTRAINT certificates_discipline_check
  CHECK (discipline IS NULL OR discipline IN ('sail', 'power'));
