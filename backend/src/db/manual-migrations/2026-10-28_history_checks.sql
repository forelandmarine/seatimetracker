-- Free AIS history checks, logged for the purchases dashboard. One NEW table, nothing
-- else touched. Additive and idempotent; safe to run before the code that uses it is
-- deployed. Railway runs SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).
CREATE TABLE IF NOT EXISTS "history_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "vessel_id" uuid NOT NULL REFERENCES "vessels"("id") ON DELETE CASCADE,
  "mmsi" text NOT NULL,
  "kind" text NOT NULL,
  "available" boolean,
  "verdict" text,
  "days_picked" integer,
  "days_with_ais" integer,
  "days_underway" integer,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "history_checks_created_at_idx" ON "history_checks" ("created_at");
CREATE INDEX IF NOT EXISTS "history_checks_user_id_idx" ON "history_checks" ("user_id");

-- RLS on with no policies, like every other public table. The backend connects as
-- postgres (BYPASSRLS), so it is unaffected.
ALTER TABLE public.history_checks ENABLE ROW LEVEL SECURITY;
