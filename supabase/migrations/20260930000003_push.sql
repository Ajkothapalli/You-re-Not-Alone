-- ─────────────────────────────────────────────────────────────────────────────
-- [N1] Push notifications — two kinds, and nothing else.
--
--   felt     — "Someone felt what you wrote."
--   question — "This week's question is here."
--
-- ── What may never be in a push, and why it is a schema concern ─────────────
-- No confession text, no headline, no id, no name, no upsell, no plan, no
-- referral reward, nothing about crisis.
--
-- Two of those are enforced HERE rather than left to the sending code:
--
--   push_outbox.counts is jsonb holding NUMBERS ONLY, checked by a
--   constraint. If the sender could carry text through the outbox, then one
--   careless join would put somebody's confession on a lock screen — which
--   is a place they never agreed to put it, readable by whoever picks up
--   the phone.
--
--   The referral reward is absent by omission and must stay that way. A push
--   saying "your thank-you week arrived" is timed to the moment an invitee's
--   confession cleared the reward criteria, so it tells the inviter, by
--   timing alone, that a specific person just wrote something. That is the
--   author↔account link CLAUDE.md #3 forbids, arriving through the back
--   door. Referral rewards stay in-app.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Devices ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_devices (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id   uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expo_token   text        NOT NULL UNIQUE,
  platform     text        NOT NULL CHECK (platform IN ('android', 'ios')),
  -- IANA, e.g. 'Asia/Kolkata'. Quiet hours are meaningless without it, and
  -- a wrong one is how somebody gets woken at 3am.
  tz           text        NOT NULL DEFAULT 'UTC',
  -- "Something new for you" instead of any detail. For a shared or visible
  -- phone: the difference between a lock screen that says somebody felt
  -- what you wrote and one that says nothing at all.
  discreet     boolean     NOT NULL DEFAULT false,
  quiet_hours  boolean     NOT NULL DEFAULT true,
  felt_on      boolean     NOT NULL DEFAULT true,
  question_on  boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Set when Expo reports DeviceNotRegistered. Kept rather than deleted so
  -- a reinstall re-registering the same token is an update, not a duplicate.
  disabled_at  timestamptz
);

CREATE INDEX IF NOT EXISTS push_devices_account_idx ON push_devices (account_id)
  WHERE disabled_at IS NULL;
-- The weekly-question cron scans by timezone and recency.
CREATE INDEX IF NOT EXISTS push_devices_tz_idx ON push_devices (tz, last_seen_at)
  WHERE disabled_at IS NULL AND question_on;

COMMENT ON TABLE push_devices IS
  'One row per device that has been granted notification permission. '
  'SERVER ONLY: RLS on with no policies, every privilege revoked. Writes go '
  'through register-push / update-push-prefs, which take account_id from the '
  'verified JWT and never from the request body.';

ALTER TABLE push_devices ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL, not a selective revoke: a selective one leaves Supabase's
-- default TRUNCATE grant, and RLS does not restrict TRUNCATE.
REVOKE ALL ON push_devices FROM anon, authenticated;

-- ── 2. The outbox ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS push_outbox (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id  uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind        text        NOT NULL CHECK (kind IN ('felt', 'question')),
  -- NUMBERS ONLY. See the header, and the CHECK below that enforces it.
  counts      jsonb       NOT NULL DEFAULT '{}',
  -- 'felt:<confession_id>:<local_date>' or 'question:<account>:<iso_week>'.
  -- One push per confession per day; a later felt that day UPDATES this row
  -- rather than inserting a second.
  dedupe_key  text        NOT NULL UNIQUE,
  not_before  timestamptz NOT NULL DEFAULT now(),
  status      text        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','sent','failed','skipped')),
  ticket_id   text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);

/**
 * counts must be a flat object of numbers.
 *
 * This is the schema refusing to be the route by which a confession reaches
 * a lock screen. The sender reads `counts` to build the body, so anything
 * that is not a number here is text that could be rendered — and the one
 * place text must never appear is the one surface the writer cannot see,
 * cannot control, and did not agree to.
 */
-- Via a function, because Postgres forbids a subquery inside a CHECK
-- (SQLSTATE 0A000) and walking the object needs one. IMMUTABLE so the
-- constraint can use it.
CREATE OR REPLACE FUNCTION jsonb_values_all_numeric(p jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_typeof(p) = 'object'
     AND NOT EXISTS (
           SELECT 1 FROM jsonb_each(p) AS kv
           WHERE jsonb_typeof(kv.value) <> 'number'
         );
$$;

COMMENT ON FUNCTION jsonb_values_all_numeric(jsonb) IS
  'True when every value in a flat jsonb object is a number. Used by '
  'push_outbox_counts_numeric to keep text out of the push pipeline.';

ALTER TABLE push_outbox DROP CONSTRAINT IF EXISTS push_outbox_counts_numeric;
ALTER TABLE push_outbox
  ADD CONSTRAINT push_outbox_counts_numeric CHECK (jsonb_values_all_numeric(counts));

CREATE INDEX IF NOT EXISTS push_outbox_due_idx
  ON push_outbox (not_before) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS push_outbox_account_day_idx
  ON push_outbox (account_id, sent_at) WHERE status = 'sent';

COMMENT ON TABLE push_outbox IS
  'Queued pushes. SERVICE ROLE ONLY. counts holds numbers only, enforced by '
  'push_outbox_counts_numeric — no confession text, headline or id may pass '
  'through here. dedupe_key carries a confession id for de-duplication and '
  'that id never leaves the database.';

ALTER TABLE push_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_outbox FROM anon, authenticated;

-- ── 3. A felt notification enqueues a push ───────────────────────────────────
--
-- Fires on notifications INSERT where type = 'felt'.
--
-- One push per CONFESSION per LOCAL DAY. A confession that is felt eight
-- times in an afternoon produces one push whose count grows, not eight
-- pushes — the second one is already an intrusion and the eighth is a
-- reason to turn notifications off.
--
-- ── Why the trigger is where the throttling lives ───────────────────────────
-- It could have gone in the sender. It is here because the dedupe_key is a
-- UNIQUE constraint, so the database itself refuses the second row rather
-- than trusting a code path to check first. Two felts arriving in the same
-- millisecond cannot both win.

CREATE OR REPLACE FUNCTION enqueue_felt_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz        text;
  v_local_day date;
  v_key       text;
BEGIN
  IF NEW.type <> 'felt' THEN RETURN NEW; END IF;
  -- A notification with no confession cannot be de-duplicated per confession,
  -- and a felt always has one. Nothing to enqueue.
  IF NEW.confession_id IS NULL THEN RETURN NEW; END IF;

  -- The local day is the DEVICE's, so "one a day" means what the person
  -- would mean by it. Falls back to UTC when no device is registered —
  -- harmless, because with no device nothing will be sent anyway.
  SELECT d.tz INTO v_tz
  FROM   push_devices d
  WHERE  d.account_id = NEW.account_id AND d.disabled_at IS NULL
  ORDER BY d.last_seen_at DESC
  LIMIT 1;

  v_local_day := (now() AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;
  v_key       := 'felt:' || NEW.confession_id::text || ':' || v_local_day::text;

  INSERT INTO push_outbox (account_id, kind, counts, dedupe_key)
  VALUES (NEW.account_id, 'felt', jsonb_build_object('n', 1), v_key)
  ON CONFLICT (dedupe_key) DO UPDATE
    -- Already sent today? Leave it alone. Bumping a sent row would make
    -- tomorrow's sender re-send it with a bigger number.
    SET counts = CASE
          WHEN push_outbox.status = 'pending'
          THEN jsonb_build_object('n', COALESCE((push_outbox.counts->>'n')::int, 0) + 1)
          ELSE push_outbox.counts
        END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_enqueue_felt_push ON notifications;
CREATE TRIGGER notifications_enqueue_felt_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION enqueue_felt_push();

-- ── 4. Has this account answered this week's question? ───────────────────────
--
-- Used by the weekly cron so nobody is nudged about something they have
-- already done. SECURITY DEFINER and service-role only: it answers a
-- question about one account's authorship, which is exactly the kind of
-- thing no client may ask.

CREATE OR REPLACE FUNCTION has_answered_question(p_account_id uuid, p_question_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM confessions c
    WHERE  c.account_id  = p_account_id
      AND  c.question_id = p_question_id
      AND  c.source      = 'user'
  );
$$;

REVOKE EXECUTE ON FUNCTION has_answered_question(uuid, uuid)
  FROM public, anon, authenticated;

-- ── 5. Grant rate per moment (§5) ────────────────────────────────────────────
--
-- Deliberately NOT a view over a table, because the ask events go to
-- PostHog rather than to this database. The query is in
-- scripts/metrics-n1.sql with a note about where to run it.

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTION — run by hand. Everything above is idempotent and safe to
-- re-run. The pg_cron schedules are in 20260930000004_push_cron.sql and are
-- listed separately there, because they start SENDING and should not be
-- switched on in the same breath as the tables.
-- ─────────────────────────────────────────────────────────────────────────────
