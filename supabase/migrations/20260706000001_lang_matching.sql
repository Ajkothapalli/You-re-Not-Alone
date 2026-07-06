-- ============================================================
-- Language-aware matching + seed_runs + daily scheduler
--
-- Changes:
--   1. confessions.lang column (BCP-47-ish tags)
--   2. seed_config.languages column
--   3. seed_runs table (scheduler idempotency + ops log)
--   4. Updated match_confession: lang filter + quality threshold
--   5. pg_cron schedule (03:30 UTC = 09:00 IST)
-- ============================================================

-- ── 1. lang column ────────────────────────────────────────────────────────────
-- BCP-47-ish tags: 'en', 'hi', 'te', 'hi-Latn', 'te-Latn', etc.
-- Existing rows default to 'en'. A one-off backfill should re-detect using
-- the same gpt-4o-mini classifier; see scripts/backfill-lang.ts (future).

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'en';

CREATE INDEX IF NOT EXISTS confessions_lang_idx ON confessions (lang);

-- Composite: the matcher does lang = X + cosine order, so lang+embedding together.
CREATE INDEX IF NOT EXISTS confessions_lang_status_idx
  ON confessions (lang, status)
  WHERE status IN ('live', 'approved');


-- ── 2. seed_config: add languages column ─────────────────────────────────────
-- Controls which languages push-daily-stories generates for.
-- Operator can add/remove languages without redeploying.

ALTER TABLE seed_config
  ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT ARRAY['en', 'hi-Latn', 'te-Latn'];


-- ── 3. seed_runs table ────────────────────────────────────────────────────────
-- One row per calendar day. Unique(run_date) is the idempotency key:
-- if the cron fires twice in a day the second invocation sees the row and skips.

CREATE TABLE IF NOT EXISTS seed_runs (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date     date         NOT NULL    DEFAULT CURRENT_DATE,
  total        int          NOT NULL    DEFAULT 0,
  summary      jsonb        NOT NULL    DEFAULT '{}',
  completed_at timestamptz  NOT NULL    DEFAULT now(),
  UNIQUE (run_date)
);

REVOKE ALL ON seed_runs FROM anon, authenticated;


-- ── 4. Updated match_confession ───────────────────────────────────────────────
-- NEW parameters (all have defaults — existing call sites still work):
--   p_seeker_lang  text  DEFAULT 'en'   — only return same-language rows
--   p_min_sim      float DEFAULT 0.35   — minimum cosine similarity
--
-- Quality gate:
--   similarity ∈ [p_min_sim, 0.97)
--   distance   = 1 − similarity, so in SQL:
--     distance ≤ 1 − p_min_sim   (resonant enough)
--     distance > 0.03             (not a near-duplicate of the seeker's text)
--
-- Drop old arity-3 signature first to avoid overload collision in PostgREST.

DROP FUNCTION IF EXISTS match_confession(extensions.vector,    text, int);
DROP FUNCTION IF EXISTS match_confession(extensions.vector(1536), text, int);

CREATE OR REPLACE FUNCTION match_confession(
  p_embedding    extensions.vector(1536),
  p_seeker_token text,
  p_seeker_lang  text  DEFAULT 'en',
  p_limit        int   DEFAULT 1,
  p_min_sim      float DEFAULT 0.35
)
RETURNS TABLE (
  id         uuid,
  text       text,
  felt_count int,
  distance   float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.text,
    c.felt_count,
    (c.embedding <=> p_embedding)::float AS distance
  FROM confessions c
  WHERE c.status IN ('live', 'approved')
    AND c.author_token <>  p_seeker_token
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
    AND c.lang          =  p_seeker_lang
    -- Resonance floor: similarity ≥ p_min_sim ↔ distance ≤ 1−p_min_sim
    AND (c.embedding <=> p_embedding) <= (1.0 - p_min_sim)
    -- Near-dup ceiling: exclude sim ≥ 0.97 (essentially same text)
    AND (c.embedding <=> p_embedding) >  0.03
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_confession(extensions.vector(1536), text, text, int, float)
  FROM public, anon, authenticated;


-- ── 5. pg_cron schedule ───────────────────────────────────────────────────────
-- Fires push-daily-stories at 03:30 UTC (09:00 IST) every day.
--
-- Prerequisites (run once, NOT in this file — keeps secrets out of migrations):
--   ALTER DATABASE postgres
--     SET app.service_role_key = '<supabase-service-role-key>';
--   ALTER DATABASE postgres
--     SET app.project_ref      = '<supabase-project-ref>';
--
-- Both extensions must be enabled:
--   Dashboard → Database → Extensions → pg_cron, pg_net
--
-- Manual trigger (any day):
--   SELECT net.http_post(
--     url     := 'https://<ref>.supabase.co/functions/v1/push-daily-stories',
--     headers := jsonb_build_object('Authorization','Bearer <service-role-key>'),
--     body    := '{}'::jsonb
--   );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
  THEN
    -- Upsert: if already scheduled, replace (idempotent re-run of this migration).
    PERFORM cron.unschedule('soulyap-daily-seed');
  EXCEPTION WHEN OTHERS THEN NULL;  -- job didn't exist yet; ignore
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
  THEN
    PERFORM cron.schedule(
      'soulyap-daily-seed',
      '30 3 * * *',
      $cron$
        SELECT net.http_post(
          url     := 'https://'
                     || current_setting('app.project_ref', true)
                     || '.supabase.co/functions/v1/push-daily-stories',
          headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer '
                             || current_setting('app.service_role_key', true)
          ),
          body    := '{}'::jsonb
        );
      $cron$
    );
    RAISE NOTICE 'pg_cron: soulyap-daily-seed scheduled (03:30 UTC daily)';
  ELSE
    RAISE NOTICE 'pg_cron/pg_net not enabled — schedule push-daily-stories via Dashboard instead';
  END IF;
END $$;
