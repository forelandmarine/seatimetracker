ALTER TABLE "vessels" DROP CONSTRAINT "vessels_mmsi_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "vessels_user_id_mmsi_uq" ON "vessels" USING btree ("user_id","mmsi");