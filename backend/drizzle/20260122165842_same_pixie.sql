ALTER TABLE "sea_time_entries" ADD COLUMN "watchkeeping_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "additional_watchkeeping_hours" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "is_stationary" boolean;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "department" text;