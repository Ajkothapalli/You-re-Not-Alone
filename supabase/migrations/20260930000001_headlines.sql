-- ─────────────────────────────────────────────────────────────────────────────
-- [H1] Headlines — a 2–8 word pull-quote, lifted word for word from the writer.
--
-- The headline is a PHRASE COPIED VERBATIM from the confession. It is never an
-- invented title and never a rewrite. The verbatim property is enforced in
-- supabase/functions/_shared/headline.ts, on the server, on every write —
-- see that file for why the model is a selector rather than an author.
--
-- ── What this column is, in privacy terms ───────────────────────────────────
-- A substring of confessions.text, which is already public in
-- confessions_public. It therefore exposes nothing that was not already
-- exposed, and it is the ONLY new thing this migration makes readable.
--
-- Nothing here touches account_id, author_token, audio_key, real_felt_count,
-- source or substance_check. Every one of them stays exactly as revoked as it
-- was (CLAUDE.md invariant 3). The recommend_confessions body below is
-- reproduced line for line from 20260929000001_feed_perf.sql with ONE column
-- added — this is the query that decides what a stranger may read, so it is
-- copied rather than "tidied".
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The column ────────────────────────────────────────────────────────────

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS headline text;

-- The same 60 as MAX_HEADLINE_CHARS in _shared/headline.ts. A CHECK rather
-- than trust in the writer of the day: the backfill script, the two Edge
-- Functions and anything added later all write this column, and a headline
-- that overruns the card is a layout bug nobody would trace back to here.
ALTER TABLE confessions DROP CONSTRAINT IF EXISTS confessions_headline_len;
ALTER TABLE confessions
  ADD CONSTRAINT confessions_headline_len
  CHECK (headline IS NULL OR char_length(headline) <= 60);

COMMENT ON COLUMN confessions.headline IS
  'A 2-8 word phrase copied VERBATIM from text, shown in bold above it. '
  'NULL is always valid and means the confession shows no headline. Never '
  'model-authored prose: _shared/headline.ts validates that the phrase is a '
  'literal substring of text before anything is stored, and cuts the stored '
  'value out of text itself. Removable by the writer while the confession is '
  'still unsealed (manage-confession, action remove_headline).';

-- ── 2. confessions_public ────────────────────────────────────────────────────
-- Rebuilt rather than altered: a view's column list cannot be extended in
-- place. Same columns as before plus headline — still no account_id, no
-- author_token, no source, no audio_key, no substance_check.

CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status,
         audio_duration_ms, audio_waveform, headline
  FROM   confessions
  WHERE  status IN ('live', 'approved');

GRANT SELECT ON confessions_public TO anon, authenticated;

-- ── 3. recommend_confessions ─────────────────────────────────────────────────
--
-- ONE change: `headline` is added to the RETURNS TABLE and to the SELECT.
-- Every filter, every ORDER BY clause and the LIMIT are byte-for-byte the
-- previous definition.
--
-- The brief asked for this in "both the normal and the p_question_id
-- versions". There is only ONE function — the question filter is a branch
-- inside this body (the `p_question_id` clauses below), not a second
-- function — so adding the column once covers both paths. Worth stating
-- because the phrasing implies two places to keep in step, and a future
-- reader looking for the second one will not find it.

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
  question_id uuid,
  headline    text
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
    c.question_id,
    c.headline
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

-- ── 4. An operator's check that verbatim actually held ───────────────────────
--
-- The property this whole feature rests on, asked of the live data rather
-- than of the code that was supposed to enforce it. Any row it returns is a
-- headline that is not in its own confession, which should be impossible.
--
--   SELECT count(*) FROM confessions_with_invented_headlines;
--
-- Service-role only: it joins headline to text, which is public anyway, but
-- an operator diagnostic has no reason to be a client surface.

CREATE OR REPLACE VIEW confessions_with_invented_headlines AS
  SELECT id, headline
  FROM   confessions
  WHERE  headline IS NOT NULL
    -- Same folding the validator does: whitespace, case. Quote and dash
    -- folding is not reproduced here, so a row appearing in this view is
    -- worth reading before treating it as a breach.
    --
    -- The trailing ellipsis is stripped first. The FALLBACK headline is the
    -- writer's opening words cut at a word boundary with a "…" appended, so
    -- the ellipsis is the one character in a valid headline that is
    -- deliberately NOT in the text. Without this the view reported every
    -- fallback as an invention — which it did on DEV, one row, and an
    -- operator reading that would reasonably conclude the whole verbatim
    -- guarantee had failed.
    AND   position(
            lower(regexp_replace(rtrim(headline, '…'), '\s+', ' ', 'g'))
            IN lower(regexp_replace(text, '\s+', ' ', 'g'))
          ) = 0;

REVOKE ALL ON confessions_with_invented_headlines FROM anon, authenticated;

COMMENT ON VIEW confessions_with_invented_headlines IS
  'Operator diagnostic: headlines that are NOT a substring of their own '
  'confession. Expected to be empty. Folds whitespace and case only, so a '
  'row here may still be a curly-quote difference rather than a real '
  'invention — read it before acting on it.';
