-- Passage refinement: live-tracked passages are checked against the Datalastic AIS
-- track once the vessel stops, before the user is asked to approve them.
-- Additive and idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- WHY: the live tracker takes a passage's start from the last position check before
-- movement was seen, which in port can be up to 6 hours old, and its end often lands
-- hours after arrival. That overstated sea time on borderline days.
--
-- New live passages are stored with sea_time_entries.status = 'checking' (hidden, like
-- 'off_board') until refined, then set to 'pending'. status is free text, so that
-- needs no DDL. This table keeps the original times for audit.
--
-- ORDERING: apply BEFORE deploying the backend that uses passage_refinements. Railway
-- runs with SKIP_MIGRATIONS=true, so apply by hand (Supabase SQL editor, or
-- psql "$DATABASE_URL" -f).

CREATE TABLE IF NOT EXISTS "passage_refinements" (
  "entry_id" uuid PRIMARY KEY REFERENCES "sea_time_entries"("id") ON DELETE CASCADE,
  "outcome" text NOT NULL,
  "original_start_time" timestamp NOT NULL,
  "original_end_time" timestamp,
  "refined_start_time" timestamp,
  "refined_end_time" timestamp,
  "original_duration_hours" numeric(10, 2),
  "refined_duration_hours" numeric(10, 2),
  "positions_used" integer NOT NULL DEFAULT 0,
  "refined_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "passage_refinements_outcome_idx" ON "passage_refinements" ("outcome");

-- The refinement job looks up 'checking' passages every 10 minutes
CREATE INDEX IF NOT EXISTS "sea_time_entries_checking_idx"
  ON "sea_time_entries" ("vessel_id")
  WHERE "status" = 'checking';

-- RLS on with no policies, like every other public table (2026-10-27 advisor fix).
-- The backend connects as postgres (BYPASSRLS), so it is unaffected.
ALTER TABLE public.passage_refinements ENABLE ROW LEVEL SECURITY;
