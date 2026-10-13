-- On/off board toggle (rotational crew and leave) + Expo push tokens.
-- Additive and idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- WHY HAND-WRITTEN: drizzle meta snapshots in backend/drizzle/ are out of sync with
-- the live database, and Railway runs with SKIP_MIGRATIONS=true. Apply this directly
-- (Supabase SQL editor, or psql "$DATABASE_URL" -f).
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the code on feat/on-board-toggle.
-- Drizzle lists every schema column in its SELECTs, so the new user columns must exist
-- first or every user read breaks. Defaults keep the running app's behaviour unchanged
-- (everyone on board) until the new code ships.
--
-- Matches backend/src/db/auth-schema.ts (user table) and schema/schema.ts (push_tokens).
-- sea_time_entries.status gains a new value, 'off_board' (no DDL needed, it is free text):
-- AIS passages detected while the user is off board. Hidden from lists, review and totals
-- until the user claims them (off_board -> pending).

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "on_board" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "off_board_since" timestamptz,
  ADD COLUMN IF NOT EXISTS "expected_return_date" date,
  ADD COLUMN IF NOT EXISTS "underway_alert_sent_at" timestamptz;

CREATE TABLE IF NOT EXISTS "push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "token" text NOT NULL,
  "platform" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "push_tokens_user_id_idx" ON "push_tokens" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "push_tokens_token_uq" ON "push_tokens" ("token");
