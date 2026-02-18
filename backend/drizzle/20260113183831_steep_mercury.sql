DROP INDEX "vessel_id_check_time_idx";--> statement-breakpoint
DROP INDEX "ais_debug_logs_vessel_id_request_time_idx";--> statement-breakpoint
DROP INDEX "ais_debug_logs_mmsi_idx";--> statement-breakpoint
DROP INDEX "scheduled_tasks_vessel_id_task_type_idx";--> statement-breakpoint
DROP INDEX "scheduled_tasks_next_run_idx";--> statement-breakpoint
DROP INDEX "scheduled_tasks_is_active_idx";--> statement-breakpoint
DROP INDEX "vessel_id_idx";--> statement-breakpoint
DROP INDEX "status_idx";--> statement-breakpoint
DROP INDEX "mmsi_idx";--> statement-breakpoint
DROP INDEX "is_active_idx";--> statement-breakpoint
CREATE INDEX "ais_checks_vessel_time_idx" ON "ais_checks" USING btree ("vessel_id","check_time");--> statement-breakpoint
CREATE INDEX "ais_debug_logs_vessel_request_time_idx" ON "ais_debug_logs" USING btree ("vessel_id","request_time");--> statement-breakpoint
CREATE INDEX "ais_debug_logs_mmsi_request_idx" ON "ais_debug_logs" USING btree ("mmsi");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_vessel_task_idx" ON "scheduled_tasks" USING btree ("vessel_id","task_type");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_task_idx" ON "scheduled_tasks" USING btree ("next_run");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_active_idx" ON "scheduled_tasks" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "sea_time_entries_vessel_id_idx" ON "sea_time_entries" USING btree ("vessel_id");--> statement-breakpoint
CREATE INDEX "sea_time_entries_status_idx" ON "sea_time_entries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vessels_mmsi_idx" ON "vessels" USING btree ("mmsi");--> statement-breakpoint
CREATE INDEX "vessels_is_active_idx" ON "vessels" USING btree ("is_active");