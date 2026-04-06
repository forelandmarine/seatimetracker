ALTER TABLE "vessels" ADD COLUMN "flag" text;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "official_number" text;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "length_metres" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "gross_tonnes" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "vessels" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;