-- notifications
-- In-app anonymous notifications for confession owners.
-- Invariants (CLAUDE.md):
--   - account_id is for routing only; never exposed in client payloads
--   - notifications never reveal feeler identity (#2/#3)
--   - service-role inserts only; no direct client table access

CREATE TABLE IF NOT EXISTS notifications (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id     uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type           text        NOT NULL CHECK (type IN ('felt', 'matched', 'live', 'removed')),
  confession_id  uuid        REFERENCES confessions(id) ON DELETE SET NULL,
  data           jsonb       NOT NULL DEFAULT '{}',
  read_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX notifications_account_created
  ON notifications(account_id, created_at DESC);

-- Sparse index for unread badge count queries
CREATE INDEX notifications_account_unread
  ON notifications(account_id)
  WHERE read_at IS NULL;

-- Security: no direct table access from anon or authenticated role.
-- Edge functions use service_role, filter by account_id from verified JWT.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notifications FROM anon, authenticated;
