CREATE TABLE "notification_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"notification_type" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"timezone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "notification_schedules_user_id_idx" ON "notification_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_schedules_active_idx" ON "notification_schedules" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "notification_schedules_user_active_idx" ON "notification_schedules" USING btree ("user_id","is_active");