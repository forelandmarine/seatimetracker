-- AIS history import (in-app purchase): three NEW tables, nothing else touched.
-- Additive and idempotent. Safe to run (and re-run) on the live Supabase DB, and safe
-- to apply before the code that uses it is deployed (no existing query reads these).
-- Railway runs SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).

CREATE TABLE IF NOT EXISTS "history_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "vessel_id" uuid NOT NULL REFERENCES "vessels"("id") ON DELETE CASCADE,
  "mmsi" text NOT NULL,
  "product_id" text NOT NULL,
  "months" integer NOT NULL,
  "transaction_id" text NOT NULL,
  "store_transaction_id" text,
  "platform" text,
  "is_sandbox" boolean NOT NULL DEFAULT false,
  "window_from" date NOT NULL,
  "window_to" date NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "days_with_data" integer,
  "passages_created" integer,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "completed_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "history_imports_user_id_idx" ON "history_imports" ("user_id");
CREATE INDEX IF NOT EXISTS "history_imports_vessel_id_idx" ON "history_imports" ("vessel_id");
CREATE INDEX IF NOT EXISTS "history_imports_status_idx" ON "history_imports" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "history_imports_transaction_id_uq" ON "history_imports" ("transaction_id");

CREATE TABLE IF NOT EXISTS "ais_history_days" (
  "mmsi" text NOT NULL,
  "day" date NOT NULL,
  "position_count" integer NOT NULL,
  "fetched_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "ais_history_days_mmsi_day_uq" ON "ais_history_days" ("mmsi", "day");

CREATE TABLE IF NOT EXISTS "ais_history_positions" (
  "mmsi" text NOT NULL,
  "position_time" timestamptz NOT NULL,
  "latitude" numeric(9, 6) NOT NULL,
  "longitude" numeric(10, 6) NOT NULL,
  "speed_knots" numeric(8, 2),
  "course" numeric(6, 2),
  "destination" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "ais_history_positions_mmsi_time_uq" ON "ais_history_positions" ("mmsi", "position_time");
