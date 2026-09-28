-- [3.6] SUBSTANCE — record whether the meaning check actually ran.
--
-- Two values, and the difference between them matters for the referral phase:
--
--   'passed'    the meaning check ran and said this is a genuine confession.
--   'unchecked' it could not run — no API key, a non-200, an unparseable
--               answer. NOT "it failed". The post was allowed because this
--               gate fails OPEN (moderation is the safety gate and fails
--               closed; this one is quality).
--
-- Anything that grants a reward must therefore treat 'unchecked' as NOT YET
-- ELIGIBLE rather than as a pass. Reading it as a pass would make an outage
-- the cheapest way to farm referrals.
--
-- There is no 'failed' value on purpose: a submission that fails the check is
-- never stored, so no row can ever carry it.

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS substance_check text NOT NULL DEFAULT 'unchecked';

ALTER TABLE confessions
  DROP CONSTRAINT IF EXISTS confessions_substance_check_valid;
ALTER TABLE confessions
  ADD CONSTRAINT confessions_substance_check_valid
  CHECK (substance_check IN ('passed', 'unchecked'));

COMMENT ON COLUMN confessions.substance_check IS
  'Did the [3.6] meaning check run and pass? passed | unchecked. '
  'unchecked means it could not run, not that the text failed — the gate '
  'fails open. Reward logic must treat unchecked as not yet eligible. '
  'SERVER ONLY: never in confessions_public, REVOKEd from anon/authenticated.';

-- ── Server-only, same discipline as author_token and account_id ──────────────
-- confessions_public is NOT rebuilt here: leaving it alone is what keeps the
-- column out of it. The REVOKE covers anyone reaching the base table directly.
REVOKE SELECT (substance_check) ON confessions FROM anon, authenticated;

-- Existing rows keep the 'unchecked' default: they predate the gate, and
-- back-filling them to 'passed' would assert something no check ever verified.
