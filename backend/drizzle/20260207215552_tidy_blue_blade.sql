ALTER TABLE "user" ADD COLUMN "revenuecat_customer_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "subscription_platform" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "trial_ends_at" timestamp with time zone;