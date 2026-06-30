-- ============================================================
-- SEED COLUMN + RECOMMEND DEPRIORITISATION
--
-- is_seed marks operator-inserted bootstrap confessions.
-- They are matchable by everyone (not in banned_tokens, not a real account),
-- and are soft-deprioritised in recommend_confessions so real submissions
-- surface first once volume grows.
--
-- Retirement: DELETE FROM confessions WHERE is_seed = true
-- ============================================================

-- ── 1. Add is_seed column ────────────────────────────────────────────────────
ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS is_seed boolean NOT NULL DEFAULT false;

-- Partial index — only covers the small seed set, zero cost on real rows.
CREATE INDEX IF NOT EXISTS confessions_is_seed_idx
  ON confessions (is_seed)
  WHERE is_seed = true;


-- ── 2. Expose is_seed in confessions_public so admin tooling can filter ───────
-- Still no author_token, no account data exposed.
DROP VIEW IF EXISTS confessions_public CASCADE;
CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, is_seed, created_at
  FROM   confessions
  WHERE  status = 'live';

GRANT SELECT ON confessions_public TO anon, authenticated;


-- ── 3. Rebuild recommend_confessions with seed deprioritisation ───────────────
-- Seeds get a small distance penalty (+0.05 cosine / +0.1 popularity score)
-- so real confessions sort above them once they exist.
-- When only seeds are available (launch day), they still surface normally.

CREATE OR REPLACE FUNCTION recommend_confessions(
  p_reader_id       uuid,
  p_author_token    text,
  p_taste_embedding extensions.vector,
  p_categories      text[],
  p_sexual_opt_in   bool    DEFAULT false,
  p_limit           int     DEFAULT 200
)
RETURNS TABLE (
  id          uuid,
  text        text,
  felt_count  int,
  categories  text[],
  created_at  timestamptz,
  distance    float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH seen AS (
    SELECT confession_id
    FROM   read_events
    WHERE  reader_account_id = p_reader_id
  )
  SELECT
    c.id,
    c.text,
    c.felt_count,
    c.categories,
    c.created_at,
    CASE
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)::float
      ELSE NULL
    END AS distance
  FROM confessions c
  WHERE c.status = 'live'
    AND c.author_token <> p_author_token
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
    AND (
      array_length(p_categories, 1) IS NULL
      OR c.categories && p_categories
    )
    AND (
      p_sexual_opt_in = true
      OR NOT ('sexuality_intimacy' = ANY(c.categories))
    )
    AND c.id NOT IN (SELECT confession_id FROM seen)
  ORDER BY
    CASE
      WHEN p_taste_embedding IS NOT NULL
        -- ANN distance + small seed penalty so real confessions surface first
        THEN (c.embedding <=> p_taste_embedding)
             + CASE WHEN c.is_seed THEN 0.05 ELSE 0.0 END
      ELSE
        -- Popularity fallback + seed penalty
        (1.0 / (1.0 + c.felt_count))
        + CASE WHEN c.is_seed THEN 0.1 ELSE 0.0 END
    END ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION recommend_confessions(uuid, text, extensions.vector, text[], bool, int)
  FROM public, anon, authenticated;
