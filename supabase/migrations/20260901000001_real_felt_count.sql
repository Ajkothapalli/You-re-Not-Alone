-- ============================================================
-- REAL_FELT_COUNT + UPDATED_AT
-- ============================================================
-- real_felt_count: incremented ONLY when a real user's submission
--   (source='user') is matched and felt. Generated companions
--   (source='generated') and seeds (source='seed') never seal a confession.
-- can_edit (never stored): computed as (real_felt_count = 0).
--   The owning user may edit while no real person has felt it.
-- updated_at: set to now() on edit; NULL means never edited.
--   Shown as "· edited" in the owner-only detail view.
-- ============================================================

-- ── 1. Add columns ────────────────────────────────────────────────────────────
ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS real_felt_count int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz;

-- Composite index: owner queries (account_id) + edit-eligibility (real_felt_count).
CREATE INDEX IF NOT EXISTS confessions_owner_edit_idx
  ON confessions (account_id, real_felt_count)
  WHERE account_id IS NOT NULL;

-- ── 2. Belt-and-suspenders: block clients from reading real_felt_count ────────
-- anon/authenticated already have REVOKE ALL on confessions (base migrations),
-- and confessions_public lists columns explicitly (no real_felt_count).
-- This column-level revoke adds an extra layer of defence.
REVOKE SELECT (real_felt_count) ON confessions FROM anon, authenticated;

-- updated_at is also owner-private — never goes into confessions_public.
REVOKE SELECT (updated_at) ON confessions FROM anon, authenticated;

-- ── 3. Rebuild confessions_public to also exclude updated_at ─────────────────
-- Drop and recreate so the explicit column list stays accurate.
DROP VIEW IF EXISTS confessions_public CASCADE;

CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status
  FROM   confessions
  WHERE  status IN ('live', 'approved');

REVOKE ALL    ON confessions_public FROM anon, authenticated;
GRANT  SELECT ON confessions_public TO   anon, authenticated;

-- ── 4. Drop and recreate increment_felt_count ─────────────────────────────────
-- Signature unchanged — existing call sites need no update.
-- Now also increments real_felt_count when the TARGET confession's source='user'.
-- Seeds (source='seed') and generated companions (source='generated') do NOT seal.
DROP FUNCTION IF EXISTS increment_felt_count(uuid);

CREATE OR REPLACE FUNCTION increment_felt_count(p_confession_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE confessions
  SET
    felt_count      = felt_count + 1,
    real_felt_count = real_felt_count
                      + CASE WHEN source = 'user' THEN 1 ELSE 0 END
  WHERE id     = p_confession_id
    AND status IN ('live', 'approved')
  RETURNING felt_count;
$$;

-- Service-role only — same access model as before.
REVOKE EXECUTE ON FUNCTION increment_felt_count(uuid) FROM public, anon, authenticated;
