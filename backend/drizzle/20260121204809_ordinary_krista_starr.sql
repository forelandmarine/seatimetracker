ALTER TABLE "sea_time_entries" ADD COLUMN "mca_compliant" boolean;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "detection_window_hours" numeric(10, 2);--> statement-breakpoint
CREATE INDEX "sea_time_entries_mca_compliant_idx" ON "sea_time_entries" USING btree ("mca_compliant");