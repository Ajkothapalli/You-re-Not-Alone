-- ============================================================
-- RECOMMEND_CONFESSIONS RPC + DSAR EXTENSION
--
-- recommend_confessions():
--   Candidate generation with hard safety filters applied BEFORE scoring.
--   Re-ranking, diversity, and exploration happen in the edge function.
--
-- Safety filters (in SQL — cannot be bypassed by the edge function):
--   1. status = 'live'
--   2. author_token != p_author_token  (no own confessions)
--   3. author_token NOT IN banned_tokens
--   4. categories && p_categories       (opted-in categories only)
--   5. sexual hard gate: exclude sexuality_intimacy unless p_sexual_opt_in = true
--   6. confession NOT IN seen           (from read_events for this reader)
-- ============================================================


-- ── recommend_confessions ────────────────────────────────────────────────────
-- Called by the recommend-confessions edge function only (service_role).
-- p_taste_embedding: NULL for cold-start users; ANN ordering falls back to popularity.
-- p_categories:      reader's opted-in list (read from DB by edge fn, not from client).
-- p_sexual_opt_in:   from DB, never from client.
-- p_author_token:    HMAC of reader's account_id; excludes own authored confessions.

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
    -- NULL distance means cold start; edge function handles both paths
    CASE
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)::float
      ELSE NULL
    END AS distance
  FROM confessions c
  WHERE c.status = 'live'
    -- [SAFETY 1] Never surface own confessions
    AND c.author_token <> p_author_token
    -- [SAFETY 2] Never surface confessions from banned authors
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
    -- [SAFETY 3] Category gate: must overlap reader's opted-in set
    AND (
      array_length(p_categories, 1) IS NULL  -- no prefs yet: allow all non-adult
      OR c.categories && p_categories
    )
    -- [SAFETY 4] Sexual hard gate: exclude sexuality_intimacy for non-opted-in readers
    AND (
      p_sexual_opt_in = true
      OR NOT ('sexuality_intimacy' = ANY(c.categories))
    )
    -- [SAFETY 5] Exclude seen
    AND c.id NOT IN (SELECT confession_id FROM seen)
  ORDER BY
    -- ANN when taste is available; popularity fallback for cold start
    CASE
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)
      ELSE (1.0 / (1.0 + c.felt_count))
    END ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION recommend_confessions(uuid, text, extensions.vector, text[], bool, int)
  FROM public, anon, authenticated;


-- ── update_reader_taste ───────────────────────────────────────────────────────
-- Atomic taste-vector update called by the edge function after each signal.
-- Uses exponential moving average: new = (1-α)*old + α*confession_embedding.
-- Negative signals (report/skip) move taste AWAY: new = old - β*(emb - old).
-- service_role only.

CREATE OR REPLACE FUNCTION update_reader_taste(
  p_reader_id     uuid,
  p_confession_id uuid,
  p_signal        text   -- 'felt'|'read_to_end'|'share'|'report'|'skip'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_emb       extensions.vector(1536);
  v_taste     extensions.vector(1536);
  v_alpha     float;
  v_new_taste extensions.vector(1536);
BEGIN
  SELECT embedding INTO v_emb FROM confessions WHERE id = p_confession_id;
  IF v_emb IS NULL THEN RETURN; END IF;

  SELECT taste_embedding INTO v_taste
  FROM reader_preferences WHERE account_id = p_reader_id;

  -- Alpha: positive signals pull toward the confession; negative push away.
  v_alpha := CASE p_signal
    WHEN 'felt', 'read_to_end', 'share' THEN  0.15
    WHEN 'report', 'skip'               THEN -0.05
    ELSE 0.0
  END;

  IF v_alpha = 0.0 THEN RETURN; END IF;

  -- Cold start: bootstrap taste directly from this embedding.
  IF v_taste IS NULL THEN
    IF v_alpha > 0 THEN
      UPDATE reader_preferences
        SET taste_embedding = v_emb, updated_at = now()
        WHERE account_id = p_reader_id;
    END IF;
    RETURN;
  END IF;

  -- EMA update using pgvector arithmetic.
  -- positive: new = (1-α)*taste + α*emb
  -- negative: new = (1+|α|)*taste - |α|*emb  (push away)
  IF v_alpha > 0 THEN
    v_new_taste := ((1.0 - v_alpha) * v_taste + v_alpha * v_emb);
  ELSE
    DECLARE v_b float := abs(v_alpha);
    BEGIN
      v_new_taste := ((1.0 + v_b) * v_taste - v_b * v_emb);
    END;
  END IF;

  UPDATE reader_preferences
    SET taste_embedding = v_new_taste, updated_at = now()
    WHERE account_id = p_reader_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_reader_taste(uuid, uuid, text)
  FROM public, anon, authenticated;


-- ── Extend dsar_delete_author_data to wipe reader data ───────────────────────
-- Per the spec: DSAR delete must wipe reader_preferences + read_events.
-- This replaces the function defined in migration 006.

CREATE OR REPLACE FUNCTION dsar_delete_author_data(
  target_token   text,
  target_account uuid
)
RETURNS TABLE(
  deleted_confessions bigint,
  held_confessions    bigint,
  deleted_matches     bigint,
  deleted_devices     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_confessions bigint := 0;
  v_held_confessions    bigint := 0;
  v_deleted_matches     bigint := 0;
  v_deleted_devices     bigint := 0;
BEGIN
  -- 1. Delete seek history
  WITH del AS (
    DELETE FROM matches
    WHERE seeker_token = target_token
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_matches FROM del;

  -- 2. Hard-delete authored confessions with no active reports (CASCADE removes
  --    read_events and confession_neighbors referencing these confessions).
  WITH del AS (
    DELETE FROM confessions
    WHERE author_token = target_token
      AND NOT EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_confessions FROM del;

  -- 3. Legal-hold: authored confessions that still have reports.
  WITH held AS (
    UPDATE confessions
    SET status = 'removed'
    WHERE author_token = target_token
      AND status      != 'removed'
      AND EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_held_confessions FROM held;

  -- 4. Delete device records
  WITH del AS (
    DELETE FROM devices
    WHERE account_id = target_account
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_devices FROM del;

  -- 5. [NEW] Wipe reader taste profile and engagement history.
  DELETE FROM read_events        WHERE reader_account_id = target_account;
  DELETE FROM reader_preferences WHERE account_id        = target_account;

  -- 6. Delete accounts row
  DELETE FROM accounts WHERE id = target_account;

  RETURN QUERY SELECT
    v_deleted_confessions,
    v_held_confessions,
    v_deleted_matches,
    v_deleted_devices;
END;
$$;

REVOKE EXECUTE ON FUNCTION dsar_delete_author_data(text, uuid)
  FROM public, anon, authenticated;
