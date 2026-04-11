-- Maritime compliance: rank, IMO, date_joined/left, trade_area, watchkeeping breakdown, leave periods, authority

-- Vessels: add IMO number and ITC tonnage
ALTER TABLE "vessels" ADD COLUMN "imo_number" text;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "tonnage_itc" numeric(10, 2);--> statement-breakpoint

-- Sea time entries: add rank, date_joined/left, trade_area, watchkeeping breakdown, certificate link
ALTER TABLE "sea_time_entries" ADD COLUMN "rank" text;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "date_joined" date;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "date_left" date;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "trade_area" text;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "bridge_watch_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "engine_watch_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "certificate_id" uuid REFERENCES "certificates"("id") ON DELETE SET NULL;--> statement-breakpoint

-- User: add maritime authority preference
ALTER TABLE "user" ADD COLUMN "maritime_authority" text;--> statement-breakpoint

-- Leave periods table
CREATE TABLE IF NOT EXISTS "leave_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "vessel_id" uuid REFERENCES "vessels"("id") ON DELETE SET NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "reason" text,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "leave_periods_user_id_idx" ON "leave_periods" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "leave_periods_vessel_id_idx" ON "leave_periods" USING btree ("vessel_id");
