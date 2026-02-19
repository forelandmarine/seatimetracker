CREATE TABLE "ais_query_timestamps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"last_query_time" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ais_query_timestamps_vessel_id_unique" UNIQUE("vessel_id")
);
--> statement-breakpoint
ALTER TABLE "ais_query_timestamps" ADD CONSTRAINT "ais_query_timestamps_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ais_query_timestamps_vessel_id_idx" ON "ais_query_timestamps" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "ais_query_timestamps_last_query_time_idx" ON "ais_query_timestamps" USING btree ("last_query_time");