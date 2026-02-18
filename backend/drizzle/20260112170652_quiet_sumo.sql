CREATE TABLE "ais_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"check_time" timestamp NOT NULL,
	"is_moving" boolean NOT NULL,
	"speed_knots" numeric(8, 2),
	"latitude" numeric(9, 6),
	"longitude" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sea_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"duration_hours" numeric(10, 2),
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mmsi" text NOT NULL,
	"vessel_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vessels_mmsi_unique" UNIQUE("mmsi")
);
--> statement-breakpoint
ALTER TABLE "ais_checks" ADD CONSTRAINT "ais_checks_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD CONSTRAINT "sea_time_entries_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vessel_id_check_time_idx" ON "ais_checks" USING btree ("vessel_id","check_time");--> statement-breakpoint
CREATE INDEX "vessel_id_idx" ON "sea_time_entries" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "status_idx" ON "sea_time_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mmsi_idx" ON "vessels" USING btree ("mmsi");