-- ─────────────────────────────────────────────────────────────────────────────
-- [B] Referral — "Give someone 7 days"
--
-- Owner decision 2026-09-28. An invitee gets 7 days of unlimited reading the
-- moment they claim. The inviter gets a thank-you week only once the person
-- they invited has actually found their way in — not on install, not on
-- signup. Capped at 4 per inviter per 30 days.
--
-- ── The rule this schema exists to protect ──────────────────────────────────
-- THE INVITER NEVER LEARNS ANYTHING ABOUT THE INVITEE. Not what they wrote,
-- not that they wrote, not when, not what they read. The reward criteria below
-- are deliberately invisible from the inviter's side: they are evaluated by a
-- SECURITY DEFINER function that returns ONE BOOLEAN per referral and is
-- callable only by the service role.
--
-- That matters more than it looks. The criteria touch a confession written by
-- the invitee, and `referrals` knows who the inviter is. Any surface that let
-- an inviter see WHY or WHEN their reward landed would leak, by timing alone,
-- that a specific person wrote something — which is exactly the author↔account
-- link CLAUDE.md #3 forbids, arriving through the back door. Hence: no
-- per-invitee detail anywhere, one boolean, and a notification that mentions
-- neither writing nor felts nor time.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Sticky A/B variant per inviter ────────────────────────────────────────
-- Server-side so it cannot drift between devices or be re-rolled by clearing
-- app data, which would make the test meaningless.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS referral_variant text
    CHECK (referral_variant IN ('gift', 'earn'));

-- ── 2. referrals ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token_id      text        NOT NULL REFERENCES share_tokens(token),
  inviter_account     uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  invitee_account     uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- Server-computed (never client-supplied) — the same hash the rate limiter
  -- uses. Stored so "one claim per device, ever" survives a reinstall.
  invitee_device_hash text,
  variant             text        CHECK (variant IN ('gift', 'earn')),
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','rewarded','capped','rejected')),
  reject_reason       text,
  claimed_at          timestamptz NOT NULL DEFAULT now(),
  rewarded_at         timestamptz,

  -- One claim per invitee account, ever. A person can be given a gift week
  -- once; the rest of the checks live in claim-invite where they can be
  -- reported as reasons.
  CONSTRAINT referrals_one_per_invitee UNIQUE (invitee_account)
);

-- "Has this device ever claimed?" — the check that stops one person farming
-- invites by making accounts. Partial: a null hash must not collide.
CREATE UNIQUE INDEX IF NOT EXISTS referrals_one_per_device
  ON referrals (invitee_device_hash)
  WHERE invitee_device_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS referrals_pending_idx
  ON referrals (status, claimed_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS referrals_inviter_rewarded_idx
  ON referrals (inviter_account, rewarded_at) WHERE status = 'rewarded';

-- Server-only. No policies at all: RLS on with none means service_role alone,
-- the same discipline confessions and share_tokens use.
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON referrals FROM anon, authenticated;

-- ── 3. The reward check — one boolean, service role only ────────────────────
--
-- Reward the inviter when the invitee's FIRST confession has genuinely landed:
--
--   substance_check = 'passed'   'unchecked' WAITS. CLAUDE.md [3.6] is explicit
--                                that unchecked is NOT a pass, and reading it as
--                                one would make an OpenAI outage the cheapest
--                                way to farm reward weeks. This is the one place
--                                rewards fail CLOSED.
--   char_count >= 80             a real attempt, not a claim ticket
--   no authorship flags          and not a near-duplicate of existing text
--   live >= 48h, never reported / hidden / removed
--   felt by a STRANGER           an account that is neither inviter nor invitee,
--                                on a device hash belonging to neither — so a
--                                second phone cannot felt its own invite
--
-- Fallback: all of the above except the stranger felt, 72h elapsed, and the
-- invitee has opened the app on a second calendar day. Otherwise an invitee in
-- a thin category could do everything right and never be credited.
--
-- Returns ONLY a boolean. No confession id, no text, no timestamps escape.

CREATE OR REPLACE FUNCTION referral_reward_due(p_referral_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  r            referrals%ROWTYPE;
  c            confessions%ROWTYPE;
  stranger_felt boolean;
  second_day    boolean;
BEGIN
  SELECT * INTO r FROM referrals WHERE id = p_referral_id AND status = 'pending';
  IF NOT FOUND THEN RETURN false; END IF;

  -- The invitee's FIRST confession, and only that one.
  SELECT * INTO c
  FROM   confessions
  WHERE  account_id = r.invitee_account AND source = 'user'
  ORDER  BY created_at ASC
  LIMIT  1;
  IF NOT FOUND THEN RETURN false; END IF;

  IF c.substance_check IS DISTINCT FROM 'passed' THEN RETURN false; END IF;
  IF coalesce(c.char_count, 0) < 80              THEN RETURN false; END IF;
  IF coalesce(array_length(c.authorship_flags, 1), 0) > 0 THEN RETURN false; END IF;
  IF c.status NOT IN ('live', 'approved')        THEN RETURN false; END IF;
  IF c.auto_flagged                              THEN RETURN false; END IF;
  IF c.created_at > now() - INTERVAL '48 hours'  THEN RETURN false; END IF;

  -- Any open or upheld report disqualifies it.
  IF EXISTS (SELECT 1 FROM reports WHERE confession_id = c.id) THEN RETURN false; END IF;

  -- Felt by someone who is neither party, on a device belonging to neither.
  SELECT EXISTS (
    SELECT 1
    FROM   read_events e
    WHERE  e.confession_id     = c.id
      AND  e.signal            = 'felt'
      AND  e.reader_account_id NOT IN (r.inviter_account, r.invitee_account)
      AND  NOT EXISTS (
             SELECT 1 FROM devices d_reader, devices d_party
             WHERE  d_reader.account_id = e.reader_account_id
               AND  d_party.account_id IN (r.inviter_account, r.invitee_account)
               AND  d_reader.device_hash = d_party.device_hash)
  ) INTO stranger_felt;

  IF stranger_felt THEN RETURN true; END IF;

  -- Fallback after 72h: did they come back on a later day?
  IF c.created_at > now() - INTERVAL '72 hours' THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM read_events e
    WHERE  e.reader_account_id = r.invitee_account
      AND  e.created_at::date  > r.claimed_at::date
  ) INTO second_day;

  RETURN second_day;
END;
$$;

REVOKE EXECUTE ON FUNCTION referral_reward_due(uuid) FROM public, anon, authenticated;

-- ── 4. The cap ───────────────────────────────────────────────────────────────
-- 4 rewarded referrals per inviter per 30 days. Beyond it the referral is
-- marked 'capped' and nothing is granted — it is not held over, because a
-- queue of pending rewards is a promise we never made.

CREATE OR REPLACE FUNCTION referral_cap_reached(p_inviter uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(*) >= 4
  FROM   referrals
  WHERE  inviter_account = p_inviter
    AND  status         = 'rewarded'
    AND  rewarded_at    > now() - INTERVAL '30 days';
$$;

REVOKE EXECUTE ON FUNCTION referral_cap_reached(uuid) FROM public, anon, authenticated;

-- ── 5. Share source 'invite' ─────────────────────────────────────────────────

ALTER TABLE share_tokens DROP CONSTRAINT IF EXISTS share_tokens_bucket_check;
ALTER TABLE share_tokens
  ADD CONSTRAINT share_tokens_bucket_check
  CHECK (bucket IN ('match', 'rtue', 'read', 'question', 'invite'));

ALTER TABLE growth_events DROP CONSTRAINT IF EXISTS growth_events_source_check;
ALTER TABLE growth_events
  ADD CONSTRAINT growth_events_source_check
  CHECK (source IN ('match', 'rtue', 'read', 'question', 'invite', 'unknown'));

-- ── 6. The thank-you notification type ───────────────────────────────────────
-- The message says nothing about writing, felts, or timing. See the header.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('felt', 'matched', 'live', 'removed', 'referral_reward', 'gift_week'));

-- ── 7. Aggregate-only stats ──────────────────────────────────────────────────
-- Counts per variant. No account ids, no tokens, no confession ids.

CREATE OR REPLACE VIEW v_referral_stats AS
WITH wrote AS (
  SELECT r.id AS referral_id
  FROM   referrals r
  WHERE  EXISTS (
    SELECT 1 FROM confessions c
    WHERE  c.account_id      = r.invitee_account
      AND  c.source          = 'user'
      AND  c.substance_check = 'passed'
  )
)
SELECT
  coalesce(r.variant, 'unassigned')                              AS variant,
  count(*)::int                                                  AS claims,
  count(*) FILTER (WHERE r.status = 'rewarded')::int             AS rewards_granted,
  count(*) FILTER (WHERE r.status = 'capped')::int               AS capped,
  count(*) FILTER (WHERE r.status = 'rejected')::int             AS rejections,
  count(*) FILTER (WHERE r.status = 'pending')::int              AS pending,
  count(w.referral_id)::int                                      AS invitees_who_wrote
FROM      referrals r
LEFT JOIN wrote w ON w.referral_id = r.id
GROUP BY  coalesce(r.variant, 'unassigned');

REVOKE ALL ON v_referral_stats FROM anon, authenticated;

-- Rejections broken out by reason, still aggregate-only.
CREATE OR REPLACE VIEW v_referral_rejections AS
SELECT coalesce(reject_reason, 'unknown') AS reason, count(*)::int AS n
FROM   referrals
WHERE  status = 'rejected'
GROUP  BY coalesce(reject_reason, 'unknown');

REVOKE ALL ON v_referral_rejections FROM anon, authenticated;
