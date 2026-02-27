ALTER TABLE "vessels" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "is_active_idx" ON "vessels" USING btree ("is_active");