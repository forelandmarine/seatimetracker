-- Referral scheme: one row per redeemed code. Both people get a free month
-- when the friend makes their first payment (backend/src/services/referrals.ts).
-- Railway runs with SKIP_MIGRATIONS=true: apply this to production by hand
-- before the backend that uses the table is deployed.

CREATE TABLE IF NOT EXISTS "referrals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "referrer_user_id" text NOT NULL,
  "referred_user_id" text NOT NULL,
  "code" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "friend_paid_at" timestamptz,
  "friend_reward_status" text NOT NULL DEFAULT 'waiting_payment',
  "friend_reward_detail" text,
  "friend_rewarded_at" timestamptz,
  "referrer_reward_status" text NOT NULL DEFAULT 'waiting_payment',
  "referrer_reward_detail" text,
  "referrer_rewarded_at" timestamptz,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_checked_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_user_uq" ON "referrals" ("referred_user_id");
CREATE INDEX IF NOT EXISTS "referrals_referrer_idx" ON "referrals" ("referrer_user_id");
