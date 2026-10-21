-- Per-vessel sector tag (yachting / commercial).
-- Additive, nullable, idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- WHY: MSN 1858 (yacht deck CoCs) only credits service on yachts, while MSN 1862
-- ratings, MSN 1904 small vessel engineer CoCs and MSN 1860 ETO accept service on
-- commercial vessels. Tagging each vessel lets a crew member who moves from
-- commercial into yachting carry their earlier time over where the rules allow,
-- and keeps it out where they do not.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the code that adds `sector` to
-- backend/src/db/schema/schema.ts. Drizzle names every schema column in its SELECTs,
-- so deploying first would break every vessel read. Railway runs with
-- SKIP_MIGRATIONS=true, so this must be applied by hand (Supabase SQL editor, or
-- psql "$DATABASE_URL" -f).
--
-- Existing rows stay null, which the app treats as yachting, so nothing anyone has
-- logged changes until they tag a vessel as commercial.

ALTER TABLE "vessels"
  ADD COLUMN IF NOT EXISTS "sector" text;  -- 'yachting' | 'commercial' (null = legacy, treated as yachting)
