-- ─────────────────────────────────────────────────────────────────────────────
-- [S1] app_config — a remote switch, not an experiment.
--
-- One row decides whether Read renders as the full-screen swipe stack or as
-- the list it is today. Everyone gets the same value. This is NOT an A/B
-- test and must not be turned into one by adding a per-account column: with
-- the current weekly readership a split would produce two samples too small
-- to distinguish from noise, and a number that cannot settle an argument is
-- worse than no number, because somebody will quote it anyway.
--
-- The sticky 50/50 split goes out by OTA later, at ~3,000 weekly readers.
--
-- ── Why it is safe to read this from the client ─────────────────────────────
-- It carries operational switches and nothing else. No per-account rows, no
-- user data, no secrets — a secret readable by anon is not a secret. The
-- values are things a reader could work out in a second by looking at their
-- own screen.
--
-- Writes are service-role only. A client that could write here could change
-- what every other reader sees.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_config IS
  'Operational switches read by the client at boot. Public by design: no '
  'per-account rows, no user data, no secrets. SELECT for anon and '
  'authenticated; writes are service-role only. Never add a column that '
  'varies by account — see the migration header on why this is not an A/B '
  'test.';

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- REVOKE ALL first, then grant back only SELECT.
--
-- Not a selective `REVOKE INSERT, UPDATE, DELETE`: that leaves Supabase's
-- default TRUNCATE grant in place, and RLS does not restrict TRUNCATE. The
-- questions table shipped with exactly that hole in W2 and it is the same
-- shape of table, so it is worth being explicit about here too.
REVOKE ALL ON app_config FROM anon, authenticated;
GRANT  SELECT ON app_config TO anon, authenticated;

-- RLS is on, so SELECT still needs a policy. Read-only, everything, both
-- roles: the table is public by design and a row-level rule would only give
-- the impression it is not.
DROP POLICY IF EXISTS app_config_read ON app_config;
CREATE POLICY app_config_read ON app_config
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── The switch ───────────────────────────────────────────────────────────────
--
-- 'stack' | 'list'. Anything else is treated as 'stack' by lib/appConfig.ts —
-- an unknown value is a typo in a dashboard, and the reader should not get a
-- broken screen because of one.

INSERT INTO app_config (key, value)
VALUES ('feed_layout', 'stack')
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTION — run this by hand, it is not applied automatically.
--
-- Identical to the above; repeated here so it can be pasted without reading
-- past the comments. Safe to run twice.
--
--   CREATE TABLE IF NOT EXISTS app_config (
--     key        text PRIMARY KEY,
--     value      text NOT NULL,
--     updated_at timestamptz NOT NULL DEFAULT now()
--   );
--   ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;
--   REVOKE ALL ON app_config FROM anon, authenticated;
--   GRANT  SELECT ON app_config TO anon, authenticated;
--   DROP POLICY IF EXISTS app_config_read ON app_config;
--   CREATE POLICY app_config_read ON app_config
--     FOR SELECT TO anon, authenticated USING (true);
--   INSERT INTO app_config (key, value) VALUES ('feed_layout', 'stack')
--     ON CONFLICT (key) DO NOTHING;
--
-- To flip the layout afterwards:
--   UPDATE app_config SET value = 'list', updated_at = now() WHERE key = 'feed_layout';
--
-- It reaches a reader on their NEXT APP LAUNCH, never mid-session. Nobody's
-- feed rearranges itself under their thumb while they are reading.
-- ─────────────────────────────────────────────────────────────────────────────
