-- ─────────────────────────────────────────────────────────────────────────────
-- [W2] The Question — one shared question a week, answered anonymously.
--
-- Owner decisions (2026-09-28): weekly cadence; an owner-approved bank of 28;
-- answers are ORDINARY confessions that also appear in their normal categories;
-- in-app only. The question is a FILTER inside the feed, never a second read
-- surface (CLAUDE.md #2).
--
-- ── Only real answers, ever ─────────────────────────────────────────────────
-- Nothing generated or seeded may carry a question_id or appear under the
-- filter. This is not a preference: the whole proposition is "other real people
-- answered this too", and a single padded answer makes that a lie the reader
-- has no way to detect. Enforced three ways — a CHECK on the column, the
-- source='user' filter in the RPC, and the count in current_question().
--
-- Weeks run Monday 00:00 → Sunday 23:59 Asia/Kolkata.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. The bank ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS questions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  text       text        NOT NULL CHECK (char_length(text) <= 120 AND char_length(text) > 0),
  position   int         NOT NULL UNIQUE,
  starts_on  date        NOT NULL,
  status     text        NOT NULL DEFAULT 'approved'
                         CHECK (status IN ('approved', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS questions_starts_on_idx ON questions (starts_on DESC);

ALTER TABLE questions ENABLE ROW LEVEL SECURITY;

-- Readers may see a question only once its week has begun. A future question
-- leaking early would spoil the one thing this feature has going for it — that
-- everyone meets it at the same time.
DROP POLICY IF EXISTS questions_read_live ON questions;
CREATE POLICY questions_read_live ON questions
  FOR SELECT TO authenticated
  USING (
    status = 'approved'
    AND starts_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date
  );

-- No client writes, ever. New questions arrive by migration (owner decision).
REVOKE INSERT, UPDATE, DELETE ON questions FROM anon, authenticated;
GRANT  SELECT                 ON questions TO   authenticated;

-- ── 2. The link from a confession to the question it answers ────────────────

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS question_id uuid REFERENCES questions(id);

-- Only a real person's confession may answer a question. A generated companion
-- or a seed carrying a question_id would show up under the filter as somebody.
ALTER TABLE confessions DROP CONSTRAINT IF EXISTS confessions_question_source_check;
ALTER TABLE confessions
  ADD CONSTRAINT confessions_question_source_check
  CHECK (question_id IS NULL OR source = 'user');

-- The filter's access path: one question, newest first, real answers only.
CREATE INDEX IF NOT EXISTS confessions_question_idx
  ON confessions (question_id, created_at DESC)
  WHERE source = 'user';

-- question_id is not secret, but it is not part of the public read surface
-- either — confessions_public lists its columns explicitly and is left alone
-- deliberately, exactly as substance_check was.
REVOKE SELECT (question_id) ON confessions FROM anon;

-- ── 3. current_question() ────────────────────────────────────────────────────
--
-- The live question is the one whose WEEK contains right now: starts_on <= today
-- < starts_on + 7 days, in Asia/Kolkata. Expressed that way rather than as
-- "the latest question that has started" so that the bank running out returns
-- NOTHING instead of silently leaving the last question up forever.
--
-- answer_count is withheld below 3. "1 answer" on a shared question reads as
-- nobody came, which is worse for the next writer than no number at all.
--
-- On substance: there is deliberately NO substance_check filter here. A
-- submission that FAILS the gate is never stored (CLAUDE.md [3.6] — there is no
-- stored failure state), so every stored row either passed or could not be
-- checked. Filtering to substance_check = 'passed' would therefore not exclude
-- junk; it would hide legitimate answers posted while the meaning check was
-- unreachable, and it would make this count disagree with the answers the feed
-- filter actually returns.

CREATE OR REPLACE FUNCTION current_question()
RETURNS TABLE (
  id           uuid,
  text         text,
  starts_on    date,
  answer_count int
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH live AS (
    SELECT q.id, q.text, q.starts_on
    FROM   questions q
    WHERE  q.status = 'approved'
      AND  q.starts_on <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND  (now() AT TIME ZONE 'Asia/Kolkata')::date < q.starts_on + 7
    ORDER BY q.starts_on DESC
    LIMIT 1
  ), counted AS (
    SELECT count(*)::int AS n
    FROM   confessions c, live
    WHERE  c.question_id = live.id
      AND  c.source      = 'user'
      AND  c.status      IN ('live', 'approved')
  )
  SELECT live.id, live.text, live.starts_on,
         CASE WHEN counted.n >= 3 THEN counted.n ELSE NULL END
  FROM live, counted;
$$;

REVOKE EXECUTE ON FUNCTION current_question() FROM anon;
GRANT  EXECUTE ON FUNCTION current_question() TO   authenticated;

-- ── 4. recommend_confessions gains an optional question filter ──────────────
--
-- DROPped rather than CREATE OR REPLACEd: adding a parameter to a Postgres
-- function creates an OVERLOAD, leaving the old six-argument version in place
-- and making every call ambiguous. The old signature has to go explicitly.
--
-- The question filter is added to the SAME WHERE clause as the safety filters,
-- which are all ANDed — so it narrows the safe set and cannot widen it. There
-- is no code path in which a question answer skips a filter that a normal feed
-- card would face.

DROP FUNCTION IF EXISTS recommend_confessions(uuid, text, extensions.vector, text[], bool, int);

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
    AND (p_question_id IS NOT NULL OR c.id NOT IN (SELECT confession_id FROM seen))
    -- The question filter: real answers to this question, and nothing else.
    AND (p_question_id IS NULL OR (c.question_id = p_question_id AND c.source = 'user'))
  ORDER BY
    CASE WHEN p_question_id IS NOT NULL THEN 0 ELSE 1 END,  -- keeps the planner honest
    CASE
      WHEN p_question_id IS NOT NULL THEN NULL
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)
      ELSE (1.0 / (1.0 + c.felt_count))
    END ASC NULLS FIRST,
    -- Newest answer first under the filter; ignored otherwise because the key
    -- above already fully orders the ordinary feed.
    CASE WHEN p_question_id IS NOT NULL THEN c.created_at END DESC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION
  recommend_confessions(uuid, text, extensions.vector, text[], bool, int, uuid)
  FROM public, anon, authenticated;

-- ── 5. Aggregate-only stats for the dashboard ───────────────────────────────
--
-- Counts and a question_id. No text, no confession ids, no account ids — the
-- same discipline every other v_* view follows, and the reason this can be
-- read by an operator dashboard at all.
--
-- first_confession counts answers that were that person's FIRST ever
-- confession, which is the number this whole phase exists to move: readers
-- becoming writers.

CREATE OR REPLACE VIEW v_question_stats AS
WITH firsts AS (
  SELECT account_id, min(created_at) AS first_at
  FROM   confessions
  WHERE  source = 'user' AND account_id IS NOT NULL
  GROUP  BY account_id
)
SELECT
  q.id                                        AS question_id,
  q.position,
  q.starts_on,
  count(c.id)::int                            AS answers,
  count(DISTINCT c.account_id)::int           AS answerers,
  count(*) FILTER (
    WHERE f.first_at IS NOT NULL AND c.created_at = f.first_at
  )::int                                      AS first_confession
FROM      questions q
LEFT JOIN confessions c
       ON c.question_id = q.id
      AND c.source      = 'user'
      AND c.status      IN ('live', 'approved')
LEFT JOIN firsts f ON f.account_id = c.account_id
GROUP BY q.id, q.position, q.starts_on;

-- Service role only, like every other dashboard view.
REVOKE ALL ON v_question_stats FROM anon, authenticated;

-- ── 6. Share source 'question' ───────────────────────────────────────────────
-- The question card is shareable, so 'question' joins the bucket allowlist.
-- The link still carries only c= and t=; no question id ever travels in it.

ALTER TABLE share_tokens DROP CONSTRAINT IF EXISTS share_tokens_bucket_check;
ALTER TABLE share_tokens
  ADD CONSTRAINT share_tokens_bucket_check
  CHECK (bucket IN ('match', 'rtue', 'read', 'question'));

ALTER TABLE growth_events DROP CONSTRAINT IF EXISTS growth_events_source_check;
ALTER TABLE growth_events
  ADD CONSTRAINT growth_events_source_check
  CHECK (source IN ('match', 'rtue', 'read', 'question', 'unknown'));

-- ── 7. The bank, in go-live order ────────────────────────────────────────────
-- Week 1 starts Monday 2026-10-05 (the first Monday after this ships), then
-- +7 days each. Text stored EXACTLY as approved, curly quotes included.

INSERT INTO questions (position, starts_on, text) VALUES
  ( 1, DATE '2026-10-05', 'What’s sitting in your drafts that you’ll never send?'),
  ( 2, DATE '2026-10-12', 'What do your parents still not know about you?'),
  ( 3, DATE '2026-10-19', 'What does your 3am brain say that daytime you never admits?'),
  ( 4, DATE '2026-10-26', 'What’s something of theirs you still can’t throw away?'),
  ( 5, DATE '2026-11-02', 'What are you only doing because of “log kya kahenge”?'),
  ( 6, DATE '2026-11-09', 'What’s a comment about your body you still hear in your head?'),
  ( 7, DATE '2026-11-16', 'What did you pray for that you’d be embarrassed to admit?'),
  ( 8, DATE '2026-11-23', 'What would you never say in the family WhatsApp group?'),
  ( 9, DATE '2026-11-30', 'What text are you still waiting for?'),
  (10, DATE '2026-12-07', 'What’s the last thing you googled at 2am?'),
  (11, DATE '2026-12-14', 'What voice note can’t you delete?'),
  (12, DATE '2026-12-21', 'What did 12-year-old you want to be, and what happened?'),
  (13, DATE '2026-12-28', 'What have you stopped doing because of how you look?'),
  (14, DATE '2027-01-04', 'What ritual do you still keep, just in case?'),
  (15, DATE '2027-01-11', 'What’s a lie you’ve told so long it feels true?'),
  (16, DATE '2027-01-18', 'What fight are you still winning in your head?'),
  (17, DATE '2027-01-25', 'What do you rehearse in the shower but never say?'),
  (18, DATE '2027-02-01', 'What song can’t you listen to anymore?'),
  (19, DATE '2027-02-08', 'What achievement still feels fake to you?'),
  (20, DATE '2027-02-15', 'What’s a health worry you haven’t told anyone?'),
  (21, DATE '2027-02-22', 'What sign are you still waiting for?'),
  (22, DATE '2027-03-01', 'What are you secretly relieved about?'),
  (23, DATE '2027-03-08', 'What did you stop saying because no one was listening?'),
  (24, DATE '2027-03-15', 'What’s the loudest thought in your head this week?'),
  (25, DATE '2027-03-22', 'What did you lose that nobody thinks counts as a loss?'),
  (26, DATE '2027-03-29', 'What part of you switches off the moment you walk into work or college?'),
  (27, DATE '2027-04-05', 'When did you last feel at home in your body?'),
  (28, DATE '2027-04-12', 'When did you last feel something bigger was listening?')
ON CONFLICT (position) DO NOTHING;
