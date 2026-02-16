ALTER TABLE "ais_checks" ADD COLUMN "api_source" text DEFAULT 'myshiptracking';--> statement-breakpoint
ALTER TABLE "ais_debug_logs" ADD COLUMN "api_source" text;