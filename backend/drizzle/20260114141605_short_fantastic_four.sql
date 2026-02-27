ALTER TABLE "sea_time_entries" ADD COLUMN "start_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "start_longitude" numeric(10, 6);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "end_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "end_longitude" numeric(10, 6);