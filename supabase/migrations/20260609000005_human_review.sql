-- ============================================================
-- M6: Human review queue
--
-- Admin-only functions and views for moderators.
-- All four objects are explicitly revoked from anon and authenticated.
-- Access is via service_role only (Supabase dashboard, admin backend).
-- ============================================================


-- ── admin_resolve_crisis ──────────────────────────────────────────────────────
-- Mark a crisis event as reviewed after a human moderator has read it.

CREATE OR REPLACE FUNCTION admin_resolve_crisis(event_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE crisis_events SET reviewed = true WHERE id = event_id;
$$;

REVOKE EXECUTE ON FUNCTION admin_resolve_crisis(uuid)
  FROM public, anon, authenticated;


-- ── admin_resolve_report ──────────────────────────────────────────────────────
-- Mark a report as resolved. Optionally restore the confession to 'live'
-- if the reviewer determines the report was erroneous.

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
  SET resolved = true
  WHERE id = report_id;

  IF restore_confession THEN
    UPDATE confessions
    SET status = 'live'
    WHERE id = (SELECT confession_id FROM reports WHERE id = report_id);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_resolve_report(uuid, bool)
  FROM public, anon, authenticated;


-- ── admin_pending_reports VIEW ────────────────────────────────────────────────
-- Shows all unresolved reports joined with confession details.
-- Ordered oldest-first so the review queue is worked in FIFO order.

CREATE OR REPLACE VIEW admin_pending_reports AS
  SELECT
    r.id          AS report_id,
    r.created_at  AS reported_at,
    r.reason,
    c.id          AS confession_id,
    c.text        AS confession_text,
    c.status,
    c.felt_count
  FROM reports r
  JOIN confessions c ON c.id = r.confession_id
  WHERE r.resolved = false
  ORDER BY r.created_at ASC;

REVOKE ALL ON admin_pending_reports FROM anon, authenticated;


-- ── admin_pending_crisis VIEW ─────────────────────────────────────────────────
-- Shows all unreviewed crisis events.
-- Text is stored here for human review only — never returned to clients.
-- Ordered oldest-first.

CREATE OR REPLACE VIEW admin_pending_crisis AS
  SELECT
    id,
    created_at,
    text
  FROM crisis_events
  WHERE reviewed = false
  ORDER BY created_at ASC;

REVOKE ALL ON admin_pending_crisis FROM anon, authenticated;
