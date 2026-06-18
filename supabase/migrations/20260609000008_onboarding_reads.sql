-- ============================================================
-- Onboarding reads: habituation RPC + analytics event addition.
--
-- Invariant (CLAUDE.md §2): the onboarding read screen is the ONLY
-- sanctioned read surface. The cap is enforced HERE, server-side.
-- A client passing max_count=50 still receives at most 2 rows.
-- ============================================================


-- ── get_onboarding_confessions ────────────────────────────────────────────────
-- Security definer so it can read confessions without granting table access.
-- Returns (id, text, felt_count) for up to 2 random live confessions
-- that were not written by a banned author.

CREATE OR REPLACE FUNCTION get_onboarding_confessions(max_count int DEFAULT 2)
RETURNS TABLE(id uuid, text text, felt_count int)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.text, c.felt_count
  FROM   confessions c
  WHERE  c.status = 'live'
    AND  c.author_token NOT IN (SELECT token FROM banned_tokens)
  ORDER  BY random()
  LIMIT  greatest(1, least(max_count, 2));   -- server clamps: 1 ≤ n ≤ 2
$$;

REVOKE EXECUTE ON FUNCTION get_onboarding_confessions(int) FROM anon;
GRANT  EXECUTE ON FUNCTION get_onboarding_confessions(int) TO authenticated;


-- ── analytics_events ─────────────────────────────────────────────────────────
-- Server-side analytics log. IDs and counts only — never confession text.
-- Revoked from anon and authenticated; written only by service_role.

CREATE TABLE IF NOT EXISTS analytics_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  props      jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON analytics_events FROM anon, authenticated;

-- Drop the existing name constraint (if any) and recreate it with the
-- onboarding_read_shown event added to the allowlist.
ALTER TABLE analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_name_check;

ALTER TABLE analytics_events
  ADD CONSTRAINT analytics_events_name_check
    CHECK (name IN (
      'confession_submitted',
      'blocked_by_moderation',
      'crisis_flagged',
      'match_shown',
      'card_shared',
      'report_submitted',
      'onboarding_read_shown'
    ));
