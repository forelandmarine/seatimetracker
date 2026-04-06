ALTER TABLE "ais_query_timestamps" DROP CONSTRAINT "ais_query_timestamps_vessel_id_unique";--> statement-breakpoint
ALTER TABLE "ais_query_timestamps" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "ais_query_timestamps_vessel_user_uq" ON "ais_query_timestamps" USING btree ("vessel_id","user_id");