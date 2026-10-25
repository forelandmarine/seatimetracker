-- Pathway assistant ("Explain training pathways"): two NEW tables, nothing else touched.
-- Additive and idempotent. Safe to run (and re-run) on the live Supabase DB, and safe
-- to apply before the code that uses it is deployed (no existing query reads these).
-- Railway runs SKIP_MIGRATIONS=true, so apply by hand (see seatime_backend_migrations).

-- The library the assistant answers from: official guidance, paraphrased provider
-- notes and the app's own requirement tables, split into passages. Loaded by
-- backend/scripts/ingest-knowledge.ts, which replaces a document's rows wholesale.
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" text PRIMARY KEY,
  "authority" text NOT NULL,
  "source_type" text NOT NULL,
  "doc_id" text NOT NULL,
  "doc_title" text NOT NULL,
  "doc_ref" text,
  "url" text,
  "version_date" text,
  "section" text,
  "currency_note" text,
  "expired" boolean NOT NULL DEFAULT false,
  "content" text NOT NULL,
  "tsv" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("doc_title", '') || ' ' || coalesce("doc_ref", '') || ' ' || coalesce("section", '')), 'A') ||
    setweight(to_tsvector('english', "content"), 'B')
  ) STORED,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING gin ("tsv");
CREATE INDEX IF NOT EXISTS "knowledge_chunks_authority_idx" ON "knowledge_chunks" ("authority");
CREATE INDEX IF NOT EXISTS "knowledge_chunks_doc_id_idx" ON "knowledge_chunks" ("doc_id");

-- One row per question asked. Drives the trial allowance (5 questions) and the daily
-- cap for subscribers, and keeps the answer, token usage and rating for review.
CREATE TABLE IF NOT EXISTS "pathway_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "conversation_id" uuid NOT NULL,
  "authority" text NOT NULL,
  "question" text NOT NULL,
  "answer" jsonb,
  "model" text NOT NULL,
  "subscription_status" text NOT NULL,
  "input_tokens" integer NOT NULL DEFAULT 0,
  "output_tokens" integer NOT NULL DEFAULT 0,
  "cache_read_tokens" integer NOT NULL DEFAULT 0,
  "cache_write_tokens" integer NOT NULL DEFAULT 0,
  "cost_usd" numeric(10, 5) NOT NULL DEFAULT 0,
  "rating" smallint,
  "rating_comment" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "pathway_questions_user_created_idx" ON "pathway_questions" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "pathway_questions_conversation_idx" ON "pathway_questions" ("conversation_id");
