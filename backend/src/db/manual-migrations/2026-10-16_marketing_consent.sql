-- Marketing email consent on the user record.
-- Additive and idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the code that adds
-- marketing_consent* to backend/src/db/auth-schema.ts. Drizzle lists every schema
-- column in its SELECTs, so the columns must exist first or every user read breaks
-- (see the 2026-08-30 target_certification outage). Railway runs SKIP_MIGRATIONS=true.
--
-- Everyone starts opted out with marketing_consent_at NULL ("never asked"), which
-- is what makes the app show its one-time opt-in prompt.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "marketing_consent" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "marketing_consent_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "marketing_consent_source" text;
