-- AMSA and Maritime NZ qualifications release: record whether the user holds
-- the completed record of training their authority reduces sea service for.
--
-- AMSA calls it a task book and it roughly halves the requirement for most
-- certificates of competency under Marine Order 505. Maritime NZ calls it a
-- training record book (TARbook) or cadet programme and it puts the applicant
-- on the shorter of the two sea-service routes. Without it the progress card
-- has to measure everyone against the longer figure, which tells a task-book
-- holder they are further from the certificate than they are.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "has_record_book" boolean DEFAULT false;--> statement-breakpoint

-- Default false for everyone. The app keeps a copy of the setting on the device
-- as well, so a user who set it before this column existed keeps their setting
-- and writes it back the next time they change it.
