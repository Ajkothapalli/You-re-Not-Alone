-- ============================================================
-- AUTHORSHIP / ANTI-FRAUD ENGINE — SCHEMA
--
-- Identity invariant preserved throughout:
--   Authorship flags live on the confession row (server-only).
--   Trust signals live account-side (account_trust, keyed to account_id).
--   No join surface between account_trust and confessions.
--   confessions_public view is NOT changed — it still exposes only
--   (id, text, felt_count, created_at); new columns are server-only.
--
-- Action ladder:
--   amplification_eligible = true  → normal surfacing in explore + share-card
--   amplification_eligible = false → submitter still gets own private match;
--                                    confession is NOT surfaced to others
-- ============================================================


-- ── 1. Add authorship columns to confessions (server-only) ───────────────────

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS amplification_eligible bool    NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS authorship_flags       text[]  NOT NULL DEFAULT '{}';

-- Belt-and-suspenders: prevent clients from ever reading these internal columns.
-- confessions_public view only selects (id, text, felt_count, created_at) anyway,
-- but this revoke ensures the column is protected even if the view ever changes.
REVOKE SELECT (amplification_eligible, authorship_flags) ON confessions
  FROM anon, authenticated;


-- ── 2. account_trust — Beta-Bernoulli per-account trust model ────────────────
--
-- mean = trust_alpha / (trust_alpha + trust_beta)
-- New account: 1/(1+1) = 0.5 (neutral).
-- Genuine submission → alpha++; suspicious submission → beta++.
-- Time decay: implemented via a scheduled function outside this migration.

CREATE TABLE IF NOT EXISTS account_trust (
  account_id   uuid        PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  trust_alpha  float       NOT NULL DEFAULT 1.0,
  trust_beta   float       NOT NULL DEFAULT 1.0,
  fraud_risk   float       NOT NULL DEFAULT 0.0 CHECK (fraud_risk BETWEEN 0 AND 1),
  last_updated timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE account_trust ENABLE ROW LEVEL SECURITY;

-- No client access — Edge Functions use service_role.
REVOKE ALL ON account_trust FROM anon, authenticated;


-- ── 3. update_account_trust RPC ──────────────────────────────────────────────
-- Called by the authorship scoring step after each submission.
-- Upserts the Beta parameters; initial row uses defaults (alpha=1, beta=1).

CREATE OR REPLACE FUNCTION update_account_trust(
  p_account_id uuid,
  p_alpha_inc  float DEFAULT 0,
  p_beta_inc   float DEFAULT 0
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO account_trust (account_id, trust_alpha, trust_beta, last_updated)
    VALUES (
      p_account_id,
      1.0 + p_alpha_inc,
      1.0 + p_beta_inc,
      now()
    )
  ON CONFLICT (account_id) DO UPDATE
    SET trust_alpha  = account_trust.trust_alpha  + p_alpha_inc,
        trust_beta   = account_trust.trust_beta   + p_beta_inc,
        last_updated = now();
$$;

REVOKE EXECUTE ON FUNCTION update_account_trust(uuid, float, float)
  FROM public, anon, authenticated;


-- ── 4. Update recommend_confessions — add amplification_eligible filter ───────
-- This is a HARD SAFETY FILTER applied BEFORE scoring in the RPC.
-- The edge function CANNOT bypass it by reordering or omitting filters.

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
    -- [SAFETY: AUTHORSHIP] Only surface human-authentic confessions to others
    AND c.amplification_eligible = true
    -- [SAFETY 1] Never surface own confessions
    AND c.author_token <> p_author_token
    -- [SAFETY 2] Never surface confessions from banned authors
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
    -- [SAFETY 3] Category gate: must overlap reader's opted-in set
    AND (
      array_length(p_categories, 1) IS NULL
      OR c.categories && p_categories
    )
    -- [SAFETY 4] Sexual hard gate
    AND (
      p_sexual_opt_in = true
      OR NOT ('sexuality_intimacy' = ANY(c.categories))
    )
    -- [SAFETY 5] Exclude seen
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


-- ── 5. Update match_confession — prefer amplification-eligible confessions ────
-- The write-flow match is the submitter's PRIVATE experience ("someone felt this").
-- Non-eligible confessions remain matchable (so the submitter always gets a match),
-- but eligible confessions rank higher (human-authored content preferred).

CREATE OR REPLACE FUNCTION match_confession(
  p_embedding    extensions.vector,
  p_seeker_token text,
  p_limit        int DEFAULT 1
)
RETURNS TABLE (
  id          uuid,
  text        text,
  felt_count  int,
  distance    float
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
  WHERE c.status = 'live'
    AND c.author_token <> p_seeker_token
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
  ORDER BY
    -- Prefer human-authored confessions; fall back to non-eligible if pool is small
    (CASE WHEN c.amplification_eligible THEN 0 ELSE 1 END),
    c.embedding <=> p_embedding
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_confession(extensions.vector, text, int)
  FROM public, anon, authenticated;


-- ── 6. Extend DSAR delete to wipe account_trust ──────────────────────────────
-- account_trust is account-side data and must be wiped on DSAR request.

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
    DELETE FROM matches WHERE seeker_token = target_token RETURNING id
  )
  SELECT count(*) INTO v_deleted_matches FROM del;

  -- 2. Hard-delete authored confessions with no active reports
  WITH del AS (
    DELETE FROM confessions
    WHERE author_token = target_token
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.confession_id = confessions.id)
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_confessions FROM del;

  -- 3. Legal-hold: authored confessions with active reports
  WITH held AS (
    UPDATE confessions
    SET status = 'removed'
    WHERE author_token = target_token
      AND status      != 'removed'
      AND EXISTS (SELECT 1 FROM reports r WHERE r.confession_id = confessions.id)
    RETURNING id
  )
  SELECT count(*) INTO v_held_confessions FROM held;

  -- 4. Delete device records
  WITH del AS (
    DELETE FROM devices WHERE account_id = target_account RETURNING id
  )
  SELECT count(*) INTO v_deleted_devices FROM del;

  -- 5. Wipe reader taste profile and engagement history
  DELETE FROM read_events        WHERE reader_account_id = target_account;
  DELETE FROM reader_preferences WHERE account_id        = target_account;

  -- 6. Wipe account trust signal
  DELETE FROM account_trust WHERE account_id = target_account;

  -- 7. Delete accounts row
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


-- ── 7. RLS verification ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'account_trust' AND rowsecurity = true
  ) THEN
    RAISE EXCEPTION 'SECURITY: RLS is NOT enabled on account_trust';
  END IF;
  RAISE NOTICE 'Authorship migration: RLS check passed.';
END;
$$;
