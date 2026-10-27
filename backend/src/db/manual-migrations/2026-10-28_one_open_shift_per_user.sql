-- One open manual shift per user (shift clock-in, commercial / CTV crews).
-- Additive, idempotent. Safe to run (and re-run) on the live Supabase DB.
--
-- WHY: clock-in checked for an open shift and then inserted one, with nothing in the
-- database to stop a second insert in between (two devices, or a retry after a
-- timeout). Clock-out then closed only one of them and the other stayed open for
-- good. An open shift is a sea_time_entries row with status 'active'.
--
-- ORDERING: optional and independent of the deploy. The code works with or without
-- this index: without it, a duplicate created by a race is removed straight after
-- the insert (services/shifts.ts dedupeOpenShifts); with it, the second insert fails
-- with 23505 and the route returns the shift that won. Railway runs with
-- SKIP_MIGRATIONS=true, so this is applied by hand (Supabase SQL editor, or
-- psql "$DATABASE_URL" -f).
--
-- BEFORE APPLYING: the index cannot be built while a user has two open shifts. Check
-- that this returns no rows (on 2026-10-27 there were no 'active' rows at all):
--   SELECT user_id, count(*) FROM sea_time_entries WHERE status = 'active'
--   GROUP BY user_id HAVING count(*) > 1;
--
-- No new table, so no RLS change. sea_time_entries already has RLS enabled.

CREATE UNIQUE INDEX IF NOT EXISTS "sea_time_entries_one_open_shift_per_user_uq"
  ON "sea_time_entries" ("user_id")
  WHERE "status" = 'active';
