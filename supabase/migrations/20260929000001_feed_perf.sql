-- ─────────────────────────────────────────────────────────────────────────────
-- [P1] Feed performance: read_events indexes, and NOT IN → NOT EXISTS.
--
-- Nothing about WHAT the feed returns changes. Every safety filter is
-- reproduced exactly, in the same order, including the W2 question filter —
-- this is the query that decides what a stranger is allowed to read, so it is
-- rewritten line for line rather than "tidied".
--
-- ── PRODUCTION NOTE ─────────────────────────────────────────────────────────
-- The CREATE INDEX statements below are plain, which is correct for DEV and
-- WRONG for production: a plain CREATE INDEX takes an ACCESS EXCLUSIVE lock
-- and blocks every write to read_events for its duration. On production run
-- the CONCURRENTLY forms by hand instead (they cannot go in a migration —
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block):
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS read_events_reader_confession_idx
--     ON read_events (reader_account_id, confession_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS read_events_reader_signal_idx
--     ON read_events (reader_account_id, signal);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS read_events_confession_signal_idx
--     ON read_events (confession_id, signal);
--
-- Then verify with \d read_events before deploying anything that depends on
-- them. A CONCURRENTLY build that fails leaves an INVALID index behind, which
-- the planner ignores silently — so "it ran" is not the same as "it worked".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Indexes ───────────────────────────────────────────────────────────────

-- The seen-exclusion in recommend_confessions, and the batched signal insert.
CREATE INDEX IF NOT EXISTS read_events_reader_confession_idx
  ON read_events (reader_account_id, confession_id);

-- The cold-start check: "has this reader engaged at least 5 times?"
CREATE INDEX IF NOT EXISTS read_events_reader_signal_idx
  ON read_events (reader_account_id, signal);

-- The referral reward check: "was this confession felt by a stranger?"
CREATE INDEX IF NOT EXISTS read_events_confession_signal_idx
  ON read_events (confession_id, signal);

-- ── 2. recommend_confessions ─────────────────────────────────────────────────
--
-- One change: `c.id NOT IN (SELECT ...)` becomes `NOT EXISTS`.
--
-- Why: NOT IN materialises the reader's entire read history and compares
-- against it row by row, and it cannot use the (reader_account_id,
-- confession_id) index added above. NOT EXISTS becomes an anti-join and can.
-- The gap widens with every confession a reader has seen, so the readers this
-- hurts most are the most engaged ones.
--
-- A note on a hazard that does NOT apply here, so nobody re-introduces it by
-- "simplifying" this back: NOT IN against a subquery yielding even one NULL
-- evaluates to NULL for every row, which would return an EMPTY feed silently.
-- read_events.confession_id is NOT NULL today, so the old form was correct —
-- but it was one nullable-column migration away from emptying the feed for
-- everyone, with no error anywhere. NOT EXISTS has no such failure mode.
--
-- Everything else is byte-for-byte the previous definition.

DROP FUNCTION IF EXISTS recommend_confessions(uuid, text, extensions.vector, text[], bool, int, uuid);

CREATE OR REPLACE FUNCTION recommend_confessions(
  p_reader_id       uuid,
  p_author_token    text,
  p_taste_embedding extensions.vector,
  p_categories      text[],
  p_sexual_opt_in   bool DEFAULT false,
  p_limit           int  DEFAULT 200,
  p_question_id     uuid DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  text        text,
  felt_count  int,
  categories  text[],
  created_at  timestamptz,
  distance    float,
  question_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
    c.question_id
  FROM confessions c
  WHERE c.status IN ('live', 'approved')
    AND c.author_token <> p_author_token
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
    AND (
      array_length(p_categories, 1) IS NULL
      OR c.categories && p_categories
      -- Answering the question is a deliberate act, so its answers are not
      -- withheld for being outside the reader's chosen categories. This only
      -- applies when the reader has explicitly turned the filter on.
      OR p_question_id IS NOT NULL
    )
    AND (
      p_sexual_opt_in = true
      OR NOT ('sexuality_intimacy' = ANY(c.categories))
    )
    -- Already-read confessions are hidden from the ordinary feed. Under the
    -- question filter they are NOT, because the list ends with "That's every
    -- answer so far" — a promise that is false if answers are quietly missing.
    AND (
      p_question_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM read_events e
        WHERE  e.reader_account_id = p_reader_id
          AND  e.confession_id     = c.id
      )
    )
    -- The question filter: real answers to this question, and nothing else.
    AND (p_question_id IS NULL OR (c.question_id = p_question_id AND c.source = 'user'))
  ORDER BY
    CASE WHEN p_question_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE
      WHEN p_question_id IS NOT NULL THEN NULL
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)
      ELSE (1.0 / (1.0 + c.felt_count))
    END ASC NULLS FIRST,
    CASE WHEN p_question_id IS NOT NULL THEN c.created_at END DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION
  recommend_confessions(uuid, text, extensions.vector, text[], bool, int, uuid)
  FROM public, anon, authenticated;
