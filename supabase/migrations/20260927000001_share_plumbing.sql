-- PHASE A: share plumbing — char_count, per-share invite tokens, and an
-- author-only human felt count.

-- ── 1. char_count ────────────────────────────────────────────────────────────
-- Server-computed from the final text. Server-only, same discipline as
-- account_id / author_token / substance_check: it is a signal about a person's
-- writing and belongs nowhere near a client.
ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS char_count int;

COMMENT ON COLUMN confessions.char_count IS
  'Length of the final stored text, computed server-side. SERVER ONLY: not in '
  'confessions_public, REVOKEd from anon/authenticated.';

REVOKE SELECT (char_count) ON confessions FROM anon, authenticated;

-- ── 2. share_tokens ──────────────────────────────────────────────────────────
-- One token per SHARE, never per account.
--
-- A per-account referral code would be a durable identifier: two shares
-- carrying the same code prove the same person sent both, and a code that
-- travels with a confession card ties that person to that confession. That is
-- exactly the link CLAUDE.md #3 exists to prevent, so every share mints a
-- fresh random token and the mapping back to an account never leaves the
-- server.
CREATE TABLE IF NOT EXISTS share_tokens (
  token      text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bucket     text NOT NULL CHECK (bucket IN ('match', 'rtue', 'read')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE share_tokens IS
  'Per-share invite tokens. One row per share, never per account — two tokens '
  'must never be linkable to one person by anything a client can see. '
  'SERVER ONLY: RLS on with no policies, REVOKE ALL from anon/authenticated.';

CREATE INDEX IF NOT EXISTS share_tokens_account_created_idx
  ON share_tokens (account_id, created_at DESC);
-- Supports the 90-day purge.
CREATE INDEX IF NOT EXISTS share_tokens_created_idx
  ON share_tokens (created_at);

ALTER TABLE share_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: RLS on with none means service_role only. A client must never
-- be able to read the token -> account mapping, in either direction.
REVOKE ALL ON share_tokens FROM anon, authenticated;

-- ── 3. Author-only human felt count ──────────────────────────────────────────
-- The sealed milestone card says a confession was felt by N strangers. It must
-- not use felt_count: seeds are inserted with a fabricated 30-300, and
-- generated companions call increment_felt_count exactly as real users do, so
-- felt_count is not a count of people. real_felt_count is (source='user'
-- only), but it is column-REVOKEd from clients and RTUE reads confessions_public.
--
-- SECURITY DEFINER so it can read the REVOKEd column, with the ownership check
-- inside: it returns a count only for a confession the CALLER wrote, and
-- nothing else. Returns NULL for anyone else's confession, which is
-- indistinguishable from "does not exist".
CREATE OR REPLACE FUNCTION own_real_felt_count(p_confession_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT real_felt_count
  FROM   confessions
  WHERE  id = p_confession_id
    AND  account_id = auth.uid()
    AND  account_id IS NOT NULL;
$$;

REVOKE EXECUTE ON FUNCTION own_real_felt_count(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION own_real_felt_count(uuid) TO authenticated;

-- ── 4. Purge share tokens with the existing retention job ────────────────────
-- Rebuilt rather than altered: a function's RETURNS TABLE cannot be extended
-- in place. Identical to 20260609000006 except for the added step and column —
-- every existing retention period is carried over unchanged.
--
-- 90 days. A token is only useful while an install might still be attributed
-- to it; past that it is a row linking a person to a share they made, which is
-- precisely what should not sit around.
DROP FUNCTION IF EXISTS purge_expired_data();

CREATE OR REPLACE FUNCTION purge_expired_data()
RETURNS TABLE(
  purged_reports       bigint,
  purged_confessions   bigint,
  purged_crisis_events bigint,
  purged_matches       bigint,
  purged_devices       bigint,
  purged_share_tokens  bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reports      bigint := 0;
  v_confessions  bigint := 0;
  v_crisis       bigint := 0;
  v_matches      bigint := 0;
  v_devices      bigint := 0;
  v_share_tokens bigint := 0;
BEGIN
  WITH del AS (
    DELETE FROM reports
    WHERE resolved = true AND resolved_at < now() - INTERVAL '365 days'
    RETURNING id
  ) SELECT count(*) INTO v_reports FROM del;

  WITH del AS (
    DELETE FROM confessions
    WHERE status = 'removed'
      AND removed_at < now() - INTERVAL '365 days'
      AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.confession_id = confessions.id)
    RETURNING id
  ) SELECT count(*) INTO v_confessions FROM del;

  WITH del AS (
    DELETE FROM crisis_events
    WHERE reviewed = true AND reviewed_at < now() - INTERVAL '90 days'
    RETURNING id
  ) SELECT count(*) INTO v_crisis FROM del;

  WITH del AS (
    DELETE FROM matches WHERE created_at < now() - INTERVAL '180 days'
    RETURNING id
  ) SELECT count(*) INTO v_matches FROM del;

  WITH del AS (
    DELETE FROM devices WHERE last_seen < now() - INTERVAL '180 days'
    RETURNING id
  ) SELECT count(*) INTO v_devices FROM del;

  WITH del AS (
    DELETE FROM share_tokens WHERE created_at < now() - INTERVAL '90 days'
    RETURNING token
  ) SELECT count(*) INTO v_share_tokens FROM del;

  RETURN QUERY SELECT v_reports, v_confessions, v_crisis, v_matches, v_devices, v_share_tokens;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_expired_data() FROM public, anon, authenticated;
