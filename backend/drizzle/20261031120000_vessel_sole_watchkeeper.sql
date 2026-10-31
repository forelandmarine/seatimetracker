-- Sole watchkeeper: the user marks a vessel where they are the only
-- watchkeeper in their department (a sole engineer, for example), so every
-- day of actual sea service on it also counts as a watchkeeping day.
-- Null means not marked.
-- Railway runs with SKIP_MIGRATIONS=true: apply this to production by hand
-- before the backend that selects the column is deployed.

ALTER TABLE "vessels" ADD COLUMN IF NOT EXISTS "is_sole_watchkeeper" boolean;
