-- ── recommend_confessions: expose `source` to the recommender ─────────────────
--
-- Owner decision 2026-09-13: AI-generated stories should recede automatically
-- as real confessions arrive, rather than being switched off at some cutover.
-- The Edge Function scores real confessions above generated ones, but it can
-- only do that if the RPC tells it which is which — `source` was selected in
-- the table but never returned, so the function had no way to know.
--
-- Deliberately NOT a filter: a thin category still fills with generated
-- stories rather than going empty. This only changes the ORDER.
-- Adding a column to RETURNS TABLE changes the function's return type, which
-- CREATE OR REPLACE cannot do ("cannot change return type of existing
-- function"). The old signature has to be dropped first.
DROP FUNCTION IF EXISTS recommend_confessions(uuid, text, extensions.vector, text[], bool, int);

CREATE FUNCTION recommend_confessions(
  p_reader_id       uuid,
  p_author_token    text,
  p_taste_embedding extensions.vector,
  p_categories      text[],
  p_sexual_opt_in   bool DEFAULT false,
  p_limit           int  DEFAULT 200
)
RETURNS TABLE (
  id         uuid,
  text       text,
  felt_count int,
  categories text[],
  created_at timestamptz,
  distance   float,
  source     text
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
    END AS distance,
    c.source
  FROM confessions c
  WHERE c.status IN ('live', 'approved')
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
        THEN (c.embedding <=> p_taste_embedding)
      ELSE (1.0 / (1.0 + c.felt_count))
    END ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION recommend_confessions(uuid, text, extensions.vector, text[], bool, int)
  FROM public, anon, authenticated;
