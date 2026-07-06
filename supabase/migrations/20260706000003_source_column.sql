-- ============================================================
-- SOURCE COLUMN + MATCH THRESHOLD UPGRADE
-- ============================================================
-- Adds `source` to track how a confession entered the pool.
-- Raises cosine-similarity threshold from 0.35 → 0.78 (same-lang)
-- and 0.88 (any-lang fallback) to stop garbage cross-lang matches.
-- Adds `api_call_log` for lightweight Edge Function rate limiting.
-- ============================================================

-- ── 1. source column ──────────────────────────────────────────────────────────
-- 'user'      — written by a real user through the submit pipeline
-- 'seed'      — operator-inserted bootstrap rows (seed migrations)
-- 'generated' — gpt-4o-mini auto-companion or daily push-daily-stories output
ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

-- Backfill old is_seed rows so the column is meaningful
UPDATE confessions SET source = 'seed'
  WHERE is_seed = true AND source = 'user';

ALTER TABLE confessions
  ADD CONSTRAINT IF NOT EXISTS confessions_source_check
  CHECK (source IN ('user', 'seed', 'generated'));

-- ── 2. Expand status CHECK to include 'retired' and 'deleted' ─────────────────
-- 'retired' — user manually retired a confession (leaves pool immediately)
-- 'deleted'  — content scrubbed during account deletion (legal hold / DSAR)
ALTER TABLE confessions DROP CONSTRAINT IF EXISTS confessions_status_check;
ALTER TABLE confessions
  ADD CONSTRAINT confessions_status_check
  CHECK (status IN (
    'live', 'approved', 'under_review',
    'crisis_held', 'removed', 'retired', 'deleted'
  ));

-- ── 3. Lock source column from clients ───────────────────────────────────────
REVOKE SELECT (source)       ON confessions FROM anon, authenticated;
-- Belt-and-suspenders: re-assert the earlier revokes
REVOKE SELECT (account_id)   ON confessions FROM anon, authenticated;
REVOKE SELECT (author_token) ON confessions FROM anon, authenticated;

-- ── 4. Rebuild confessions_public: explicit column list excludes account_id,
--       author_token, and source ─────────────────────────────────────────────
DROP VIEW IF EXISTS confessions_public CASCADE;
CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status
  FROM   confessions
  WHERE  status IN ('live', 'approved');

REVOKE ALL    ON confessions_public FROM anon, authenticated;
GRANT  SELECT ON confessions_public TO   anon, authenticated;

-- ── 5. Update match_confession: raise threshold + add any-lang fallback param ─
-- p_min_sim   default raised to 0.78 (was 0.35) — stops bad cross-topic matches.
-- p_any_lang  when true, skips the lang filter (for the 0.88 any-lang fallback).
-- The near-dup guard (distance > 0.03, i.e. similarity < 0.97) is kept.

DROP FUNCTION IF EXISTS match_confession(
  extensions.vector(1536), text, text, int, float, uuid
);

CREATE OR REPLACE FUNCTION match_confession(
  p_embedding       extensions.vector(1536),
  p_seeker_token    text,
  p_seeker_lang     text    DEFAULT 'en',
  p_limit           int     DEFAULT 1,
  p_min_sim         float   DEFAULT 0.78,
  p_seeker_account  uuid    DEFAULT NULL,
  p_any_lang        boolean DEFAULT false
)
RETURNS TABLE(id uuid, text text, felt_count int, distance float)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.text,
    c.felt_count,
    (c.embedding <=> p_embedding) AS distance
  FROM confessions c
  WHERE status IN ('live', 'approved')
    AND c.author_token                  <> p_seeker_token
    AND c.author_token                  NOT IN (SELECT token FROM banned_tokens)
    AND (p_any_lang OR c.lang = p_seeker_lang)
    AND (c.embedding <=> p_embedding)   <= (1.0 - p_min_sim)
    AND (c.embedding <=> p_embedding)   >  0.03
    AND (
      p_seeker_account IS NULL
      OR c.account_id IS DISTINCT FROM p_seeker_account
    )
  ORDER BY distance
  LIMIT p_limit;
$$;

-- ── 6. api_call_log — lightweight per-function rate limit tracking ─────────────
-- Used by get-my-confessions (30/hr) and manage-confession (10/day).
-- Pruned by the existing purge_expired_data() or manually; rows older than
-- 48h are irrelevant and can be deleted anytime.
CREATE TABLE IF NOT EXISTS api_call_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  fn         text        NOT NULL,
  called_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_call_log_account_fn_idx
  ON api_call_log (account_id, fn, called_at DESC);

-- Clients must never access this table directly
REVOKE ALL ON api_call_log FROM anon, authenticated;
