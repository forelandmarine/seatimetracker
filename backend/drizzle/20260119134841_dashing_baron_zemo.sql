ALTER TABLE "ais_checks" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "ais_debug_logs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "sea_time_entries" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "user_id" text;--> statement-breakpoint
CREATE INDEX "ais_checks_user_id_idx" ON "ais_checks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ais_debug_logs_user_id_idx" ON "ais_debug_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_user_id_idx" ON "scheduled_tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sea_time_entries_user_id_idx" ON "sea_time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vessels_user_id_idx" ON "vessels" USING btree ("user_id");
