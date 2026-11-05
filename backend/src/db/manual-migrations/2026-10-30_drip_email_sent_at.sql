-- Day-3 and day-7 drip emails: record when each was sent, so a backend restart or two
-- instances overlapping during a deploy can't send them again. Before this the "sent"
-- list lived in memory and every deploy re-sent to everyone in the 24h window.
-- Two NEW nullable columns on "user", nothing else touched. Additive and idempotent;
-- safe to run before the code that uses it is deployed. Railway runs
-- SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "day3_email_sent_at" timestamptz;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "day7_email_sent_at" timestamptz;

-- Everyone already past a threshold has either had that email or left its window, so
-- mark them done. Without this the first deploy would send once more to everyone
-- currently inside a window.
UPDATE "user" SET "day3_email_sent_at" = now()
  WHERE "day3_email_sent_at" IS NULL AND "created_at" <= now() - interval '3 days';
UPDATE "user" SET "day7_email_sent_at" = now()
  WHERE "day7_email_sent_at" IS NULL AND "created_at" <= now() - interval '7 days';
