-- Thames crews (2.5.0): vessel default trade area and passenger vessel flag. Additive, idempotent. NOT YET APPLIED TO PROD.
--
-- ORDERING (IMPORTANT): apply this BEFORE deploying the 2.5.0 backend. Railway runs with
-- SKIP_MIGRATIONS=true, and the backend reads vessels.default_trade_area and vessels.is_passenger in every vessel
-- query, so a missing column breaks vessel and summary requests (the 2026-08-30 outage).
--
-- default_trade_area: trade area for this vessel's entries logged without one. Inland lets
-- shift and manual days on river boats without AIS count toward the Boatmasters' Licence
-- without editing each entry. A trade area set on an entry always wins.
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS default_trade_area text;

-- is_passenger: the user says this is a passenger vessel, so deck service on it counts toward
-- the Boatmasters' Licence passenger endorsement (MSN 1853 Annex 5 Table C).
ALTER TABLE vessels ADD COLUMN IF NOT EXISTS is_passenger boolean;
