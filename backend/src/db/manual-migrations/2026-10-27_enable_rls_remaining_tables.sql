-- Supabase security advisor fix (27 Oct 2026): rls_disabled_in_public + sensitive_columns_exposed.
-- Idempotent. Safe to run (and re-run) on the live Supabase DB. APPLIED TO PROD 2026-10-27 21:21 UTC.
--
-- Tables created by earlier manual migrations (on_board_toggle, history_import, exit_survey,
-- pathway_assistant, vessel_identity_changes) had Row Level Security off, so anyone holding the
-- public anon key could read and write them through /rest/v1. RLS on with NO policies closes that
-- route. The backend is unaffected: it connects as postgres, which owns these tables and has
-- BYPASSRLS. Any NEW public table must also get ENABLE ROW LEVEL SECURITY in its own migration.
--
-- Rollback for one table if needed: ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history_imports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_history_days        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_history_positions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exit_surveys            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vessel_identity_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pathway_questions       ENABLE ROW LEVEL SECURITY;

-- Leftover Supabase-auth trigger function (SECURITY DEFINER). Not callable by API users any more,
-- and its search_path is pinned.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
