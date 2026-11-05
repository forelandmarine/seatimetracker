-- "Find a course" (2.4.0): course dates read from training providers' calendars.
-- Two NEW tables, nothing else touched. Additive and idempotent; safe to run before
-- the code that uses them is deployed. Railway runs SKIP_MIGRATIONS=true, so apply
-- by hand (see seatime_backend_migrations).
CREATE TABLE IF NOT EXISTS "training_course_dates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider_id" text NOT NULL,
  "course_code" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date,
  "price_text" text,
  "availability_text" text,
  "booking_url" text,
  "source_url" text,
  "fetched_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "training_course_dates_provider_idx" ON "training_course_dates" ("provider_id");
CREATE INDEX IF NOT EXISTS "training_course_dates_course_idx" ON "training_course_dates" ("course_code", "start_date");
CREATE UNIQUE INDEX IF NOT EXISTS "training_course_dates_uq" ON "training_course_dates" ("provider_id", "course_code", "start_date");

CREATE TABLE IF NOT EXISTS "training_date_sources" (
  "provider_id" text PRIMARY KEY,
  "dates_url" text NOT NULL,
  "parser" text NOT NULL,
  "last_run_at" timestamptz,
  "last_ok_at" timestamptz,
  "last_count" text,
  "last_error" text
);

-- RLS on with no policies, like every other public table (2026-10-27 advisor fix).
-- The backend connects as postgres (BYPASSRLS), so it is unaffected.
ALTER TABLE public.training_course_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_date_sources ENABLE ROW LEVEL SECURITY;
