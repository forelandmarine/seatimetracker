-- Speed pass (2.5.0): an index for the entry lists every screen reads.
-- Additive, idempotent. Safe to run (and re-run) on the live Supabase DB. NOT YET APPLIED TO PROD.
-- Railway runs with SKIP_MIGRATIONS=true, so this is applied by hand. The backend does not
-- depend on it: without it the same queries run, just with a scan as the tables grow.
--
-- Today the tables are small and almost all of the response time is the network trip
-- between the Railway service and the database, so expect little change on the day; it
-- keeps the entry lists quick as history imports add entries.

-- Entry lists (/api/sea-time, /api/sea-time/pending, the report summary) filter by user and
-- status and sort by start time. The existing single-column user_id index has to sort after.
CREATE INDEX IF NOT EXISTS sea_time_entries_user_status_start_idx
  ON sea_time_entries (user_id, status, start_time DESC);
