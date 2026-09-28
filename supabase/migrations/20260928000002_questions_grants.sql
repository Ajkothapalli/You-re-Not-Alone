-- ─────────────────────────────────────────────────────────────────────────────
-- [W2] Harden the grants on `questions`.
--
-- Found by querying information_schema on DEV after 20260928000001 applied,
-- which is the only way this class of bug shows up: the migration read as if
-- it locked the table down, and the privileges said otherwise.
--
-- Supabase grants ALL on new public tables to anon and authenticated by
-- default. `REVOKE INSERT, UPDATE, DELETE` removed the three that were named
-- and silently left the rest, so both roles still held:
--
--   TRUNCATE   — and RLS does NOT restrict TRUNCATE. A row-level policy is no
--                defence against emptying the whole table; only the privilege
--                is. This is the one that actually matters.
--   TRIGGER    — lets a role attach a trigger to the table.
--   REFERENCES — lets a role create an FK against it.
--
-- anon also kept the default SELECT. RLS meant it read nothing (the policy is
-- FOR SELECT TO authenticated, and a table with RLS on and no matching policy
-- returns no rows), so nothing leaked — but a privilege that is only harmless
-- because a second mechanism happens to cover it is the kind of thing that
-- stops being harmless the moment someone adds a policy.
--
-- The rest of the project's locked tables (confessions, share_tokens,
-- crisis_events) use REVOKE ALL and grant back only what is needed. This makes
-- `questions` match.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON questions FROM anon, authenticated;

-- Exactly one privilege back, to exactly one role. Which ROWS that role sees
-- is still decided by the questions_read_live policy: approved only, and only
-- once the week has begun.
GRANT SELECT ON questions TO authenticated;
