-- Cancellation (exit) survey: one NEW table, nothing else touched.
-- Additive and idempotent. Safe to run (and re-run) on the live Supabase DB, and safe
-- to apply before the code that uses it is deployed (no existing query reads these).
-- Railway runs SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).

CREATE TABLE IF NOT EXISTS "exit_surveys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "cancellation_key" text NOT NULL,
  "trigger" text NOT NULL,
  "period_type" text,
  "product_id" text,
  "platform" text,
  "reasons" text[] NOT NULL DEFAULT '{}',
  "comment" text,
  "skipped" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "exit_surveys_user_id_idx" ON "exit_surveys" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "exit_surveys_user_key_uq" ON "exit_surveys" ("user_id", "cancellation_key");
