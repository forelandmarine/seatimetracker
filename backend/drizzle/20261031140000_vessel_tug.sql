-- Tug: the user marks a vessel as a tug, so deck service on it counts as tug
-- service toward the MGN 495 tug ratings and tug officer CoCs.
-- Null means not marked. tug_capacity is the user's usual capacity on the
-- tug ('rating', 'officer' or 'cadet'), used for entries logged without a
-- rank, such as AIS passages.
-- Railway runs with SKIP_MIGRATIONS=true: apply this to production by hand
-- before the backend that selects the column is deployed.

ALTER TABLE "vessels" ADD COLUMN IF NOT EXISTS "is_tug" boolean;
ALTER TABLE "vessels" ADD COLUMN IF NOT EXISTS "tug_capacity" text;
