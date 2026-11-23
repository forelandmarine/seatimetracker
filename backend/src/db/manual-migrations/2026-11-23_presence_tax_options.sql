-- Days abroad (2.5.0): per-user tax options. One NEW column, additive and idempotent.
-- Safe to run (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
--
-- ORDERING: apply AFTER 2026-11-10_presence_stays.sql and BEFORE deploying the backend
-- that reads presence_settings.tax_options (every presence summary selects it, so the
-- Days abroad screen fails without it). Railway runs SKIP_MIGRATIONS=true: apply by hand.
--
-- tax_options (jsonb):
--   es_certificate_years: int[]  calendar years for which the user holds a tax residence
--                                certificate from another country (Spain stops adding
--                                sporadic absences for that year, Ley 35/2006 art. 9.1.a)
--   nz_visitor: boolean          user says they meet New Zealand's non-resident visitor
--                                conditions (Income Tax Act 2007 s YD 1(13), YD 1B, from
--                                1 April 2026)
--   cy_60_day: boolean           Cyprus 60-day rule conditions met
--   ae_90_day: boolean           UAE 90-day rule conditions met
ALTER TABLE presence_settings ADD COLUMN IF NOT EXISTS tax_options jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Check: SELECT column_name FROM information_schema.columns WHERE table_name = 'presence_settings';
-- Rollback: ALTER TABLE presence_settings DROP COLUMN IF EXISTS tax_options;
