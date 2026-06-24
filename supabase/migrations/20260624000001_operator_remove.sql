-- ============================================================
-- MVP safety ops helpers: solo-operator remove + operator_reports view
--
-- The admin_pending_reports view and admin_resolve_report function
-- already exist (20260609000005_human_review.sql). This migration
-- adds admin_remove_confession for direct removal by ID from Studio,
-- and an operator_reports view that surfaces the full review queue in
-- plain English for a non-technical operator working in the Supabase
-- dashboard.
-- ============================================================


-- ── admin_remove_confession ────────────────────────────────────────────────────
-- Sets a confession to 'removed' so it exits the match pool and read surfaces.
-- No cascade delete: the row is kept for legal hold / audit trail.
-- All active reports for this confession are also resolved automatically.
-- service_role only (Supabase Studio / admin backend).

CREATE OR REPLACE FUNCTION admin_remove_confession(p_confession_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE confessions
  SET status = 'removed'
  WHERE id = p_confession_id;

  -- Auto-resolve all open reports for this confession
  UPDATE reports
  SET resolved = true
  WHERE confession_id = p_confession_id
    AND resolved = false;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_remove_confession(uuid)
  FROM public, anon, authenticated;


-- ── operator_reports ──────────────────────────────────────────────────────────
-- Human-readable review queue: unresolved reports joined with confession text
-- and current status. Ordered oldest-first (FIFO) for fairness.
-- Replaces admin_pending_reports for operator use in Supabase Studio.
-- Use: SELECT * FROM operator_reports;
--      SELECT admin_remove_confession('...id...');
--      SELECT admin_resolve_report('...id...', false);  -- dismiss without removal

CREATE OR REPLACE VIEW operator_reports AS
SELECT
  r.id                                          AS report_id,
  r.confession_id,
  r.reason,
  r.created_at                                  AS reported_at,
  c.text                                        AS confession_text,
  c.status                                      AS confession_status,
  c.felt_count,
  CASE c.status
    WHEN 'removed' THEN 'already removed'
    WHEN 'live'    THEN 'live — action needed'
    ELSE c.status
  END                                           AS action_needed,
  -- Quick-action hint shown in Studio
  format(
    'SELECT admin_remove_confession(''%s'');',
    r.confession_id
  )                                             AS remove_sql
FROM reports r
JOIN confessions c ON c.id = r.confession_id
WHERE r.resolved = false
ORDER BY r.created_at ASC;

REVOKE ALL ON operator_reports FROM anon, authenticated;
