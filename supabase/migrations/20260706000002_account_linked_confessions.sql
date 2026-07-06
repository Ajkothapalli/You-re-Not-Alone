-- ============================================================
-- ACCOUNT-LINKED CONFESSIONS (owner decision 2026-07-05)
-- ============================================================
-- Confessions now store account_id server-side for ownership,
-- moderation, and deletion.
--
-- Anonymity guarantee (updated CLAUDE.md invariant #3):
--   account_id is NEVER exposed in:
--     - confessions_public view
--     - API responses / match payloads
--     - analytics events
--     - share cards
--   It is ownership plumbing only — invisible to all clients.
--
-- New capability enabled:
--   - "My Confessions" screen: owner retrieves their own confessions
--     server-side (cross-device) via get-my-confessions Edge Function
--   - Remove: owner soft-deletes via manage-confession Edge Function
--   - Delete-account: confessions deleted/anonymized by account_id (two paths)
-- ============================================================

-- ── 1. Add account_id column (nullable — legacy confessions have HMAC token only) ─
ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS account_id uuid NULL REFERENCES accounts(id) ON DELETE SET NULL;

-- Index for fast "my confessions" lookups (get-my-confessions Edge Function)
CREATE INDEX IF NOT EXISTS confessions_account_id_idx
  ON confessions (account_id)
  WHERE account_id IS NOT NULL;

-- ── 2. Lock down the column — clients must never read account_id ──────────────
-- account_id is ownership metadata only; no user can see who authored what.
REVOKE SELECT (account_id) ON confessions FROM anon, authenticated;
-- Belt-and-suspenders: re-assert author_token revoke (from 20240003_security.sql)
REVOKE SELECT (author_token) ON confessions FROM anon, authenticated;

-- ── 3. Rebuild confessions_public without account_id (explicit invariant) ─────
-- The invariant: confessions_public NEVER exposes account_id or author_token.
-- Columns: id, text, felt_count, categories, created_at, status
DROP VIEW IF EXISTS confessions_public CASCADE;
CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status
  FROM   confessions
  WHERE  status IN ('live', 'approved');

REVOKE ALL    ON confessions_public FROM anon, authenticated;
GRANT  SELECT ON confessions_public TO   anon, authenticated;

-- ── 4. Update match_confession: add account_id exclusion layer ────────────────
-- Primary exclusion: author_token != seeker_token (HMAC-based, works for all rows).
-- New: also exclude by account_id where set (new confessions), as a second layer.
-- The function signature gains p_seeker_account (optional, defaults NULL).
-- The old 5-arg signature is dropped before recreating.

DROP FUNCTION IF EXISTS match_confession(
  extensions.vector(1536), text, text, int, float
);

CREATE OR REPLACE FUNCTION match_confession(
  p_embedding       extensions.vector(1536),
  p_seeker_token    text,
  p_seeker_lang     text    DEFAULT 'en',
  p_limit           int     DEFAULT 1,
  p_min_sim         float   DEFAULT 0.35,
  p_seeker_account  uuid    DEFAULT NULL
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
    AND c.lang                          =  p_seeker_lang
    AND (c.embedding <=> p_embedding)   <= (1.0 - p_min_sim)
    AND (c.embedding <=> p_embedding)   >  0.03
    AND (
      p_seeker_account IS NULL
      OR c.account_id IS DISTINCT FROM p_seeker_account
    )
  ORDER BY distance
  LIMIT p_limit;
$$;

-- ── 5. Update dsar_delete_author_data to null account_id on legal-hold rows ───
-- After this update the function:
--   (a) deletes confessions by account_id OR author_token (covers both old and new)
--   (b) NULLs account_id on legal-hold rows before marking them 'removed'
--       so no account link remains on held confessions
--   (c) still deletes reader data (read_events, reader_preferences)
--   (d) still deletes the accounts row last

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

  -- 2. Hard-delete authored confessions with no active reports
  --    Match by author_token (legacy + new) OR account_id (new) — union covers
  --    any inconsistency between the two identifiers.
  WITH del AS (
    DELETE FROM confessions
    WHERE (author_token = target_token OR account_id = target_account)
      AND NOT EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_confessions FROM del;

  -- 3. Legal-hold: confessions with active reports cannot be hard-deleted (FK RESTRICT).
  --    NULL out account_id + mark removed — account link is severed immediately.
  WITH held AS (
    UPDATE confessions
    SET    status     = 'removed',
           account_id = NULL
    WHERE  (author_token = target_token OR account_id = target_account)
      AND  status      != 'removed'
      AND  EXISTS (
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

  -- 5. Delete reader data
  DELETE FROM read_events        WHERE reader_account_id = target_account;
  DELETE FROM reader_preferences WHERE account_id        = target_account;

  -- 6. Delete accounts row (confessions already gone / anonymized above)
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

-- ── 6. New function: dsar_anonymize_author ────────────────────────────────────
-- Alternative to full erase: confessions stay live in the pool but the
-- account_id link is severed. Reader data and devices are still deleted.
-- Accounts row is deleted. Auth identity is gone; confessions live on anonymously.

CREATE OR REPLACE FUNCTION dsar_anonymize_author(
  target_token   text,
  target_account uuid
)
RETURNS TABLE(
  anonymized_confessions bigint,
  deleted_devices        bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anonymized bigint := 0;
  v_devices    bigint := 0;
BEGIN
  -- Sever account_id link — confession stays live, text untouched
  WITH upd AS (
    UPDATE confessions
    SET    account_id = NULL
    WHERE  author_token = target_token OR account_id = target_account
    RETURNING id
  )
  SELECT count(*) INTO v_anonymized FROM upd;

  -- Delete device records
  WITH del AS (
    DELETE FROM devices
    WHERE account_id = target_account
    RETURNING id
  )
  SELECT count(*) INTO v_devices FROM del;

  -- Delete reader data
  DELETE FROM read_events        WHERE reader_account_id = target_account;
  DELETE FROM reader_preferences WHERE account_id        = target_account;

  -- Delete accounts row
  DELETE FROM accounts WHERE id = target_account;

  RETURN QUERY SELECT v_anonymized, v_devices;
END;
$$;

REVOKE EXECUTE ON FUNCTION dsar_anonymize_author(text, uuid)
  FROM public, anon, authenticated;
