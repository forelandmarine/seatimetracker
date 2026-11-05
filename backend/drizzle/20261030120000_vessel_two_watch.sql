-- USCG two-watch credit: the user marks a vessel as authorised to run a
-- two-watch system (46 U.S.C. 8104, 46 CFR 15.705), so a 12-hour working day
-- on it counts as 1.5 days (46 CFR 10.107). Null means not marked.
-- Railway runs with SKIP_MIGRATIONS=true: apply this to production by hand
-- before the backend that selects the column is deployed.

ALTER TABLE "vessels" ADD COLUMN IF NOT EXISTS "is_two_watch" boolean;
