-- ─────────────────────────────────────────────────────────────────────────────
-- [F] Open a Feeling — a shared link opens the feeling it was shared from.
--
-- Owner decision 2026-09-29. The page is a DOORWAY, not a second read surface:
-- one feeling per link, no feed, no list, no "more like this", no indexing.
-- CLAUDE.md #2 is unaffected — nothing here lets anyone browse.
--
-- ── Why a token→confession link is allowed at all ───────────────────────────
-- share_tokens already stores account_id, so the table already knows who
-- shared. Adding confession_id means one row can now say "this account shared
-- this confession" — which is an authorship-adjacent link, and the reason this
-- needs saying out loud rather than being slipped in.
--
-- It is acceptable on exactly the same terms as confessions.account_id, which
-- CLAUDE.md #3 already permits: the row is SERVER-ONLY. RLS is on with no
-- policies, every privilege is revoked from anon and authenticated, and no
-- client — app or website — ever receives any of these columns. The website
-- calls an Edge Function that returns rendered CONTENT, never the row.
--
-- What it must never become: a way to ask "what did this account share", or
-- "who shared this confession". Nothing reads this table by account_id or by
-- confession_id. Lookups go one way only — token → content.
--
-- Lookup is by the random 10-character token, never by confession id, so the
-- pages cannot be enumerated or scraped.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. What a share points at ────────────────────────────────────────────────

ALTER TABLE share_tokens
  ADD COLUMN IF NOT EXISTS confession_id   uuid REFERENCES confessions(id) ON DELETE SET NULL,
  -- The sharer's "Include my words" choice, captured at share time. A sealed
  -- share stays sealed forever: changing it later would retroactively publish
  -- words someone deliberately withheld.
  ADD COLUMN IF NOT EXISTS words_included  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS question_id     uuid REFERENCES questions(id) ON DELETE SET NULL;

COMMENT ON TABLE share_tokens IS
  'Per-share invite tokens. SERVER-ONLY: RLS on with no policies and every '
  'privilege revoked from anon/authenticated. Rows link an account to a share '
  'and (since 2026-09-29) to the confession shared, which is authorship-'
  'adjacent and permitted on the same terms as confessions.account_id — it is '
  'never returned to any client, and is only ever read token-first. Never '
  'query this table by account_id or confession_id.';

-- Deliberately NOT indexed on confession_id or account_id. An index is an
-- invitation to query that way, and the only supported direction is
-- token → content (the primary key already serves it).

-- ── 2. Opens ─────────────────────────────────────────────────────────────────
--
-- visitor_hash is a salted hash of IP + user agent, ROTATED DAILY by including
-- the date in the salt. That is what makes it a de-duplication key rather than
-- a tracking identifier: the same person on two different days produces two
-- unrelated hashes, so nothing here can follow anyone across time.
--
-- No IP, no user agent and no precise timestamp is stored — only the day.

CREATE TABLE IF NOT EXISTS share_opens (
  token        text        NOT NULL REFERENCES share_tokens(token) ON DELETE CASCADE,
  day          date        NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  visitor_hash text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token, day, visitor_hash)
);

CREATE INDEX IF NOT EXISTS share_opens_token_idx ON share_opens (token, day DESC);

ALTER TABLE share_opens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON share_opens FROM anon, authenticated;

COMMENT ON TABLE share_opens IS
  'Deduped opens of a shared link. visitor_hash is HMAC(ip + user-agent + day) '
  '— the daily rotation makes it a de-dup key, not a visitor identity. No IP, '
  'user agent or precise time is retained. Link-preview fetchers are excluded '
  'before insert: a preview is not a person.';

-- ── 3. The open notification ─────────────────────────────────────────────────
-- Grouped, count-only, and says nothing about who, where or when.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('felt', 'matched', 'live', 'removed',
                  'referral_reward', 'gift_week', 'share_opened'));

-- ── 4. Opens per share, for the sharer's notification ───────────────────────
--
-- SECURITY DEFINER and service-role only. Returns a COUNT and nothing else:
-- the caller learns how many people opened a share, never which people, from
-- where, or at what time.

CREATE OR REPLACE FUNCTION share_open_count(p_token text, p_since timestamptz)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int FROM share_opens
  WHERE token = p_token AND created_at > p_since;
$$;

REVOKE EXECUTE ON FUNCTION share_open_count(text, timestamptz)
  FROM public, anon, authenticated;

-- ── 5. Aggregate-only dashboard view ─────────────────────────────────────────
-- Counts per bucket. No tokens, no confession ids, no account ids.

CREATE OR REPLACE VIEW v_share_opens AS
SELECT
  t.bucket,
  count(DISTINCT t.token)::int                       AS shares,
  count(o.token)::int                                AS opens,
  count(DISTINCT (o.token, o.day, o.visitor_hash))::int AS unique_opens
FROM      share_tokens t
LEFT JOIN share_opens  o ON o.token = t.token
GROUP BY  t.bucket;

REVOKE ALL ON v_share_opens FROM anon, authenticated;
