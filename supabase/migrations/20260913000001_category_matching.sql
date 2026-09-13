-- Category-based matching (owner decision 2026-09-13).
--
-- Until now, submit-confession's "you write, we match you with someone who
-- felt the same" moment required EMBEDDING_API_KEY: it embedded the text and
-- called match_confession(), which ranks candidates by pgvector cosine
-- distance — matching on semantic closeness of what was written.
--
-- Owner decision: for now, match on the confession's CATEGORY instead of its
-- embedding. This removes the hard dependency on EMBEDDING_API_KEY for the
-- core write flow. It does NOT touch MODERATION_API_KEY — the safety gate
-- fails closed in every environment regardless of this decision (CLAUDE.md
-- §1) — and it does not touch the explore feed's recommend_confessions,
-- which already tolerated a null taste_embedding and falls back to
-- popularity ordering.
--
-- match_confession() (cosine-based) is left in place, unused for now. Nothing
-- here drops the embedding column or stops storing it when a key IS present —
-- re-enabling semantic matching later is a matter of switching which RPC
-- submit-confession calls, not a schema change.

CREATE OR REPLACE FUNCTION match_confession_by_category(
  p_categories      text[],
  p_seeker_token    text,
  p_seeker_lang     text    DEFAULT 'en',
  p_limit           int     DEFAULT 1,
  p_seeker_account  uuid    DEFAULT NULL,
  p_any_lang        boolean DEFAULT false
)
RETURNS TABLE (
  id         uuid,
  text       text,
  felt_count int
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.text,
    c.felt_count
  FROM confessions c
  WHERE c.status IN ('live', 'approved')
    AND c.author_token                 <> p_seeker_token
    AND c.author_token                 NOT IN (SELECT token FROM banned_tokens)
    AND (p_any_lang OR c.lang = p_seeker_lang)
    AND (
      p_seeker_account IS NULL
      OR c.account_id IS DISTINCT FROM p_seeker_account
    )
    AND (
      -- No categories to match on (LLM disabled, keyword layer found nothing,
      -- no adult signal) → don't strand the writer with silence. Same
      -- fallback shape as the client's dummy-pool matcher (lib/dummyConfessions.ts
      -- matchingPool(): narrow/empty categories widen to the full pool rather
      -- than showing nothing.
      cardinality(p_categories) = 0
      OR c.categories && p_categories
    )
  -- Random, not "best" — there is no similarity score to rank by, and a
  -- felt_count-desc order would show the same few popular confessions to
  -- everyone who shares a category.
  ORDER BY random()
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_confession_by_category(text[], text, text, int, uuid, boolean)
  FROM public, anon, authenticated;
