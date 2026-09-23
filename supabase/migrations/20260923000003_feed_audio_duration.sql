-- ═══════════════════════════════════════════════════════════════════════════
-- recommend_confessions: return audio_duration_ms so the feed can show a play
-- control on voice confessions.
--
-- Recreated wholesale rather than patched: the return type changes, and
-- Postgres will not ALTER a function's RETURNS TABLE in place. Everything else
-- is carried over verbatim from 20260913000002 — the scoring, the source
-- ordering, the banned-token and author filters are unchanged.
--
-- audio_key is deliberately absent from the select list. The feed needs to know
-- that a recording EXISTS and how long it is; it must never learn where it
-- lives.
-- ═══════════════════════════════════════════════════════════════════════════

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
  id                uuid,
  text              text,
  felt_count        int,
  categories        text[],
  created_at        timestamptz,
  distance          float,
  source            text,
  audio_duration_ms int
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
    c.source,
    -- Duration only. audio_key is NEVER selected here: the feed must be able to
    -- show a play control without any client ever holding a path to a voice
    -- (CLAUDE.md invariant 3). Playback goes through get-audio-url.
    c.audio_duration_ms
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
