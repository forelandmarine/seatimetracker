-- USCG qualifications release: let a user pin the certificate they are working
-- toward, so certification progress can be measured against their own target
-- rather than a hard-coded MCA one.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "target_certification" text;--> statement-breakpoint

-- Existing USCG users were shown MCA progress because there was no USCG data.
-- Leave the column null for everyone: the client falls back to the default
-- target for the user's authority and department until they choose one.
