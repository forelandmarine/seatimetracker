-- Anonymous first-run funnel events (sign-up drop-off). One NEW table, nothing else
-- touched. Additive and idempotent; safe to run before the code that uses it is
-- deployed. Railway runs SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).
CREATE TABLE IF NOT EXISTS "app_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "event" text NOT NULL,
  "install_id" text NOT NULL,
  "platform" text,
  "app_version" text,
  "detail" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "app_events_created_at_idx" ON "app_events" ("created_at");
CREATE INDEX IF NOT EXISTS "app_events_event_idx" ON "app_events" ("event");

-- RLS on with no policies, like every other public table. The backend connects as
-- postgres (BYPASSRLS), so it is unaffected.
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;
