-- ============================================================
-- DATA LIFECYCLE — retention timestamps, FK fixes, purge, DSAR
--
-- Retention periods below mirror docs/policies/DATA_RETENTION.md.
-- Change that document first, then update the intervals here.
-- ============================================================


-- ── Part 1: Timestamp columns ─────────────────────────────────────────────────

-- confessions.removed_at — set by trigger on status → 'removed'.
-- Used by purge_expired_data() to determine when a removed confession is
-- eligible for hard deletion.
ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- crisis_events.reviewed_at — stamped by admin_resolve_crisis().
ALTER TABLE crisis_events
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- reports.resolved_at — stamped by admin_resolve_report().
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Backfill: existing removed confessions get created_at as a conservative lower bound.
UPDATE confessions
SET removed_at = created_at
WHERE status = 'removed' AND removed_at IS NULL;


-- ── Part 2: Trigger — stamp removed_at on status transition ──────────────────

CREATE OR REPLACE FUNCTION confessions_stamp_removed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'removed' AND (OLD.status IS DISTINCT FROM 'removed') THEN
    NEW.removed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_removed_at ON confessions;

CREATE TRIGGER stamp_removed_at
  BEFORE UPDATE OF status ON confessions
  FOR EACH ROW
  EXECUTE FUNCTION confessions_stamp_removed_at();


-- ── Part 3: FK surgery ────────────────────────────────────────────────────────

-- matches.shown_confession_id: set null → cascade
-- Without this, confessions are undeletable when match rows reference them.
ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_shown_confession_id_fkey;
ALTER TABLE matches
  ADD CONSTRAINT matches_shown_confession_id_fkey
    FOREIGN KEY (shown_confession_id)
    REFERENCES confessions(id)
    ON DELETE CASCADE;

-- reports.confession_id: cascade → restrict (legal hold)
-- A confession cannot be hard-deleted while reports reference it.
-- The purge job deletes reports first; confession becomes eligible next cycle.
ALTER TABLE reports
  DROP CONSTRAINT IF EXISTS reports_confession_id_fkey;
ALTER TABLE reports
  ADD CONSTRAINT reports_confession_id_fkey
    FOREIGN KEY (confession_id)
    REFERENCES confessions(id)
    ON DELETE RESTRICT;


-- ── Part 4: Replace admin RPCs to stamp timestamps ────────────────────────────

-- Replaces the version from migration 005; adds reviewed_at.
CREATE OR REPLACE FUNCTION admin_resolve_crisis(event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crisis_events
  SET reviewed = true, reviewed_at = now()
  WHERE id = event_id;
$$;

REVOKE EXECUTE ON FUNCTION admin_resolve_crisis(uuid)
  FROM public, anon, authenticated;


-- Replaces the version from migration 005; adds resolved_at and clears removed_at on restore.
CREATE OR REPLACE FUNCTION admin_resolve_report(
  report_id          uuid,
  restore_confession bool DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE reports
  SET resolved = true, resolved_at = now()
  WHERE id = report_id;

  IF restore_confession THEN
    UPDATE confessions
    SET status     = 'live',
        removed_at = NULL          -- clear so the purge clock resets if re-removed later
    WHERE id = (SELECT confession_id FROM reports WHERE id = report_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_resolve_report(uuid, bool)
  FROM public, anon, authenticated;


-- ── Part 5: purge_expired_data() ──────────────────────────────────────────────
--
-- Retention periods (mirror docs/policies/DATA_RETENTION.md — change there first):
--   reports              365 days after resolved
--   removed confessions  365 days after removed_at (AND no remaining reports)
--   crisis events         90 days after reviewed
--   matches              180 days after created
--   devices              180 days since last_seen

CREATE OR REPLACE FUNCTION purge_expired_data()
RETURNS TABLE(
  purged_reports       bigint,
  purged_confessions   bigint,
  purged_crisis_events bigint,
  purged_matches       bigint,
  purged_devices       bigint
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
BEGIN
  -- 1. Purge resolved reports first so their confessions become eligible below.
  WITH del AS (
    DELETE FROM reports
    WHERE resolved = true
      AND resolved_at < now() - INTERVAL '365 days'
    RETURNING id
  )
  SELECT count(*) INTO v_reports FROM del;

  -- 2. Purge removed confessions — only when no reports remain (RESTRICT FK guard).
  --    Reports deleted in step 1 (same txn) are already gone.
  WITH del AS (
    DELETE FROM confessions
    WHERE status     = 'removed'
      AND removed_at < now() - INTERVAL '365 days'
      AND NOT EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_confessions FROM del;

  -- 3. Purge reviewed crisis events.
  WITH del AS (
    DELETE FROM crisis_events
    WHERE reviewed    = true
      AND reviewed_at < now() - INTERVAL '90 days'
    RETURNING id
  )
  SELECT count(*) INTO v_crisis FROM del;

  -- 4. Purge old match log entries.
  WITH del AS (
    DELETE FROM matches
    WHERE created_at < now() - INTERVAL '180 days'
    RETURNING id
  )
  SELECT count(*) INTO v_matches FROM del;

  -- 5. Purge stale device records.
  WITH del AS (
    DELETE FROM devices
    WHERE last_seen < now() - INTERVAL '180 days'
    RETURNING id
  )
  SELECT count(*) INTO v_devices FROM del;

  RETURN QUERY SELECT v_reports, v_confessions, v_crisis, v_matches, v_devices;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_expired_data()
  FROM public, anon, authenticated;


-- ── Part 6: Schedule daily purge via pg_cron ─────────────────────────────────
-- Catches the exception so this migration doesn't fail on projects where
-- pg_cron is unavailable. Run purge_expired_data() externally in that case.

DO $$
BEGIN
  PERFORM cron.schedule(
    'yana-purge-expired-data',       -- job name (idempotent; schedule replaces existing)
    '30 3 * * *',                    -- 03:30 UTC daily
    'SELECT purge_expired_data()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING
    'pg_cron not available (%). purge_expired_data() must be scheduled externally.',
    SQLERRM;
END;
$$;


-- ── Part 7: dsar_delete_author_data(target_token, target_account) ─────────────
--
-- Executes a full DSAR deletion for one account:
--   1. Delete seek history (matches where this user was seeker)
--   2. Hard-delete authored confessions that have NO reports (their match rows CASCADE)
--   3. Set 'removed' on authored confessions that DO have reports (legal hold —
--      hidden immediately; purge_expired_data() will hard-delete after reports age out)
--   4. Delete device records
--   5. Delete the accounts row
--
-- Exceptions (unchanged by this function):
--   - crisis_events: stored without account linkage — unattributable by design
--   - CSAM report records: retained under legal obligation

CREATE OR REPLACE FUNCTION dsar_delete_author_data(
  target_token   text,
  target_account uuid
)
RETURNS TABLE(
  deleted_confessions bigint,
  held_confessions    bigint,
  deleted_matches     bigint,
  deleted_devices     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_confessions bigint := 0;
  v_held_confessions    bigint := 0;
  v_deleted_matches     bigint := 0;
  v_deleted_devices     bigint := 0;
BEGIN
  -- 1. Delete seek history
  WITH del AS (
    DELETE FROM matches
    WHERE seeker_token = target_token
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_matches FROM del;

  -- 2. Hard-delete authored confessions with no active reports.
  --    match rows referencing these confessions cascade-delete automatically.
  WITH del AS (
    DELETE FROM confessions
    WHERE author_token = target_token
      AND NOT EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_confessions FROM del;

  -- 3. Legal-hold: authored confessions that still have reports cannot be
  --    hard-deleted (RESTRICT FK). Mark them removed so they are hidden now;
  --    removed_at is set by the stamp_removed_at trigger.
  WITH held AS (
    UPDATE confessions
    SET status = 'removed'
    WHERE author_token = target_token
      AND status      != 'removed'
      AND EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_held_confessions FROM held;

  -- 4. Delete device records
  WITH del AS (
    DELETE FROM devices
    WHERE account_id = target_account
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_devices FROM del;

  -- 5. Delete accounts row
  DELETE FROM accounts WHERE id = target_account;

  RETURN QUERY SELECT
    v_deleted_confessions,
    v_held_confessions,
    v_deleted_matches,
    v_deleted_devices;
END;
$$;

REVOKE EXECUTE ON FUNCTION dsar_delete_author_data(text, uuid)
  FROM public, anon, authenticated;
