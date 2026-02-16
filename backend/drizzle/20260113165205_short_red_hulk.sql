CREATE TABLE "ais_debug_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vessel_id" uuid NOT NULL,
	"mmsi" text NOT NULL,
	"api_url" text NOT NULL,
	"request_time" timestamp NOT NULL,
	"response_status" text NOT NULL,
	"response_body" text,
	"authentication_status" text NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"vessel_id" uuid NOT NULL,
	"interval_hours" text NOT NULL,
	"last_run" timestamp,
	"next_run" timestamp NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ais_debug_logs" ADD CONSTRAINT "ais_debug_logs_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ais_debug_logs_vessel_id_request_time_idx" ON "ais_debug_logs" USING btree ("vessel_id","request_time");--> statement-breakpoint
CREATE INDEX "ais_debug_logs_mmsi_idx" ON "ais_debug_logs" USING btree ("mmsi");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_vessel_id_task_type_idx" ON "scheduled_tasks" USING btree ("vessel_id","task_type");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_next_run_idx" ON "scheduled_tasks" USING btree ("next_run");--> statement-breakpoint
CREATE INDEX "scheduled_tasks_is_active_idx" ON "scheduled_tasks" USING btree ("is_active");