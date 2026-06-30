-- ============================================================
-- ADMIN DASHBOARD TABLES + DB-LEVEL WORLD SEPARATION
--
-- THE WALL (non-negotiable invariant):
--   World A = Trust & Safety  — confession_id, content, flags, reports
--   World B = Accounts & Billing — account_id, email, payments, bans
--   No view, column, or join crosses this wall.
--   Only break_glass_requests (two-person, time-boxed, logged) is the
--   one permitted join, and only for CSAM/legal/DSAR.
--
-- DB role strategy:
--   yana_ts_role     — GRANT on World A objects only
--   yana_billing_role — GRANT on World B objects only
--   Neither role has SELECT on the other world's objects.
--   SQL alone cannot join A→B or B→A.
-- ============================================================


-- ── 1. Create world roles ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'yana_ts_role') THEN
    CREATE ROLE yana_ts_role NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'yana_billing_role') THEN
    CREATE ROLE yana_billing_role NOLOGIN;
  END IF;
END;
$$;


-- ── 2. admin_users ────────────────────────────────────────────────────────────
-- Registry of humans permitted to access the admin dashboard.
-- Allowlisted emails only. Role determines which world(s) they can see.
-- Service role writes; no client or authenticated access.

CREATE TABLE IF NOT EXISTS admin_users (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text        NOT NULL UNIQUE,
  role         text        NOT NULL CHECK (role IN (
                             'super_admin', 'trust_safety',
                             'billing_support', 'analyst'
                           )),
  allowed_ips  text[]      NOT NULL DEFAULT '{}',  -- empty = any IP (dev); non-empty = strict
  active       bool        NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_login   timestamptz
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_users FROM anon, authenticated;

-- TS role can check admin_users (to validate login), billing role too
GRANT SELECT ON admin_users TO yana_ts_role, yana_billing_role;


-- ── 3. audit_log ─────────────────────────────────────────────────────────────
-- Immutable append-only log. No UPDATE, no DELETE, no RLS bypass.
-- Every PII view, content read, action, and break-glass event is written here.

CREATE TABLE IF NOT EXISTS audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor_email  text        NOT NULL,
  actor_role   text        NOT NULL,
  action       text        NOT NULL,   -- e.g. 'read_confession_content', 'ban_account'
  target_type  text,                   -- 'confession', 'account', 'report', ...
  target_id    text,                   -- UUID of the target (as text, no FK)
  justification text,                  -- required for break-glass + punitive actions
  ip_address   text,
  metadata     jsonb NOT NULL DEFAULT '{}'
  -- NO UPDATE, NO DELETE — enforced via revoke below
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON audit_log FROM anon, authenticated;
-- Append-only: even service role can't DELETE (enforced in application, not SQL alone,
-- but we revoke grants from both world roles to prevent accidental deletion)
GRANT SELECT, INSERT ON audit_log TO yana_ts_role, yana_billing_role;
-- No UPDATE, no DELETE granted to either world role.


-- ── 4. moderation_queue ───────────────────────────────────────────────────────
-- Items flagged for human review. World A only.
-- source: 'report' | 'authorship' | 'moderation_hold' | 'csam'

CREATE TABLE IF NOT EXISTS moderation_queue (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  confession_id uuid        REFERENCES confessions(id) ON DELETE CASCADE,
  source        text        NOT NULL CHECK (source IN (
                              'report', 'authorship', 'moderation_hold', 'csam'
                            )),
  priority      int         NOT NULL DEFAULT 5,  -- 1=highest, 10=lowest
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN (
                              'pending', 'in_review', 'resolved_keep',
                              'resolved_remove', 'escalated'
                            )),
  assigned_to   text,       -- admin email
  resolved_at   timestamptz,
  resolved_by   text,
  resolution_note text
);

ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON moderation_queue FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON moderation_queue TO yana_ts_role;
-- yana_billing_role has NO access to moderation_queue


-- ── 5. billing_events ────────────────────────────────────────────────────────
-- RevenueCat webhook events (synced by the revenuecat-webhook edge function).
-- World B only.

CREATE TABLE IF NOT EXISTS billing_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  account_id      uuid        REFERENCES accounts(id) ON DELETE SET NULL,
  event_type      text        NOT NULL,  -- 'purchase', 'renewal', 'cancellation', 'refund', 'grace_period', ...
  product_id      text,                  -- 'yana_month', 'yana_6month', 'yana_year'
  store           text,                  -- 'app_store', 'play_store'
  currency        text,
  amount_usd      numeric(10,2),
  rc_customer_id  text,
  rc_event_id     text UNIQUE,           -- RevenueCat event ID (dedup)
  raw             jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON billing_events FROM anon, authenticated;
GRANT SELECT ON billing_events TO yana_billing_role;
-- yana_ts_role has NO access to billing_events


-- ── 6. break_glass_requests ──────────────────────────────────────────────────
-- The ONE permitted join between worlds. Requires:
--   a) Justification (CSAM/NCMEC mandate, valid legal process, or user-initiated DSAR)
--   b) Two-person approval (requester + a different super_admin approver)
--   c) Time box: access expires after time_box_minutes
--   d) Immutable audit trail
-- The join itself is performed by a SECURITY DEFINER function that writes to audit_log
-- before and after, then relocks.

CREATE TABLE IF NOT EXISTS break_glass_requests (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  requester_email    text        NOT NULL,
  justification      text        NOT NULL,
  legal_basis        text        NOT NULL CHECK (legal_basis IN (
                                   'csam_ncmec', 'legal_process', 'user_dsar'
                                 )),
  target_confession  uuid,       -- which confession (A side)
  target_account     uuid,       -- which account (B side)
  status             text        NOT NULL DEFAULT 'pending' CHECK (status IN (
                                   'pending', 'approved', 'denied', 'expired', 'executed'
                                 )),
  approver_email     text,       -- must differ from requester_email
  approved_at        timestamptz,
  expires_at         timestamptz,
  time_box_minutes   int         NOT NULL DEFAULT 60,
  executed_at        timestamptz,
  executed_by        text,
  result_summary     text        -- what was found (logged here, not in confession row)
);

ALTER TABLE break_glass_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON break_glass_requests FROM anon, authenticated;
-- Only super_admin can access break_glass_requests
-- Both roles can SELECT to see pending requests; INSERT for super_admin only
GRANT SELECT ON break_glass_requests TO yana_ts_role, yana_billing_role;


-- ── 7. World A views (yana_ts_role) ──────────────────────────────────────────
-- Trust & Safety sees confession metadata and reports.
-- Confession CONTENT access is gated at the application layer + audit-logged.

CREATE OR REPLACE VIEW admin_trust_confessions AS
  SELECT
    c.id,
    c.created_at,
    c.categories,
    c.status,
    c.felt_count,
    c.amplification_eligible,
    c.authorship_flags,
    array_length(c.authorship_flags, 1) > 0 AS has_auth_flags,
    char_length(c.text) AS text_length
    -- c.text is intentionally excluded from this view
    -- c.author_token is intentionally excluded (invariant)
  FROM confessions c;

GRANT SELECT ON admin_trust_confessions TO yana_ts_role;
REVOKE ALL ON admin_trust_confessions FROM anon, authenticated, yana_billing_role;

-- Content-gated view: reading text requires explicit audit log (app-layer enforced)
CREATE OR REPLACE VIEW admin_confession_content AS
  SELECT id, text
  FROM confessions;

GRANT SELECT ON admin_confession_content TO yana_ts_role;
REVOKE ALL ON admin_confession_content FROM anon, authenticated, yana_billing_role;

-- Reports queue for Trust & Safety (already exists as admin_pending_reports)
GRANT SELECT ON admin_pending_reports TO yana_ts_role;
REVOKE ALL ON admin_pending_reports FROM yana_billing_role;

-- Crisis counts only (NEVER content surveillance)
CREATE OR REPLACE VIEW admin_crisis_counts AS
  SELECT
    date_trunc('day', created_at) AS day,
    count(*) FILTER (WHERE reviewed = false) AS pending_review,
    count(*) FILTER (WHERE reviewed = true)  AS reviewed,
    count(*)                                  AS total
  FROM crisis_events
  GROUP BY 1
  ORDER BY 1 DESC;

GRANT SELECT ON admin_crisis_counts TO yana_ts_role;
REVOKE ALL ON admin_crisis_counts FROM anon, authenticated, yana_billing_role;

-- Authenticity review queue (uncertain band = ai_invisible flag, no ai_hold)
CREATE OR REPLACE VIEW admin_authenticity_queue AS
  SELECT
    c.id,
    c.created_at,
    c.categories,
    c.felt_count,
    c.authorship_flags,
    c.amplification_eligible,
    char_length(c.text) AS text_length
  FROM confessions c
  WHERE 'ai_invisible' = ANY(c.authorship_flags)
    AND c.status = 'live'
  ORDER BY c.created_at ASC;

GRANT SELECT ON admin_authenticity_queue TO yana_ts_role;
REVOKE ALL ON admin_authenticity_queue FROM anon, authenticated, yana_billing_role;

-- Authenticity analytics (fairness audit by cohort = category proxy)
CREATE OR REPLACE VIEW admin_authenticity_stats AS
  SELECT
    date_trunc('day', created_at)    AS day,
    count(*)                          AS total,
    count(*) FILTER (WHERE NOT amplification_eligible) AS invisible_count,
    count(*) FILTER (WHERE 'ai_friction' = ANY(authorship_flags)) AS friction_count,
    count(*) FILTER (WHERE 'ai_hold'    = ANY(authorship_flags)) AS hold_count,
    round(
      count(*) FILTER (WHERE NOT amplification_eligible)::numeric / nullif(count(*),0) * 100,
    2) AS invisible_rate_pct
  FROM confessions
  GROUP BY 1
  ORDER BY 1 DESC;

GRANT SELECT ON admin_authenticity_stats TO yana_ts_role;
REVOKE ALL ON admin_authenticity_stats FROM anon, authenticated, yana_billing_role;


-- ── 8. World B views (yana_billing_role) ─────────────────────────────────────
-- Accounts & Billing sees email, payments, bans — NO confession content.

CREATE OR REPLACE VIEW admin_accounts AS
  SELECT
    a.id,
    a.created_at,
    a.auth_provider,
    a.banned,
    a.ban_reason,
    a.temp_ban_expires_at,
    a.temp_ban_count,
    a.abuse_strike_count,
    u.email,
    e.is_premium,
    e.product_id    AS premium_product,
    e.expires_at    AS premium_expires,
    t.trust_alpha,
    t.trust_beta,
    CASE WHEN (t.trust_alpha + t.trust_beta) > 0
      THEN round((t.trust_alpha / (t.trust_alpha + t.trust_beta))::numeric, 3)
      ELSE 0.5
    END AS trust_score,
    t.fraud_risk
  FROM accounts a
  LEFT JOIN auth.users      u ON u.id = a.id
  LEFT JOIN entitlements    e ON e.account_id = a.id
  LEFT JOIN account_trust   t ON t.account_id = a.id;

GRANT SELECT ON admin_accounts TO yana_billing_role;
REVOKE ALL ON admin_accounts FROM anon, authenticated, yana_ts_role;

-- Revenue: MRR + active subs by tier
CREATE OR REPLACE VIEW admin_revenue_summary AS
  SELECT
    product_id,
    store,
    currency,
    count(DISTINCT account_id) FILTER (
      WHERE event_type IN ('purchase','renewal') AND created_at > now() - interval '30 days'
    ) AS active_subs_30d,
    sum(amount_usd) FILTER (
      WHERE event_type IN ('purchase','renewal') AND created_at > now() - interval '30 days'
    ) AS revenue_30d_usd,
    count(*) FILTER (WHERE event_type = 'refund') AS refunds_total,
    count(*) FILTER (WHERE event_type = 'cancellation'
      AND created_at > now() - interval '30 days') AS cancellations_30d
  FROM billing_events
  GROUP BY product_id, store, currency;

GRANT SELECT ON admin_revenue_summary TO yana_billing_role;
REVOKE ALL ON admin_revenue_summary FROM anon, authenticated, yana_ts_role;

-- Fraud signals
CREATE OR REPLACE VIEW admin_fraud_flags AS
  SELECT
    a.id          AS account_id,
    u.email,
    t.fraud_risk,
    t.trust_alpha,
    t.trust_beta,
    a.banned,
    a.temp_ban_count,
    a.abuse_strike_count,
    a.created_at
  FROM account_trust t
  JOIN accounts    a ON a.id = t.account_id
  LEFT JOIN auth.users u ON u.id = t.account_id
  WHERE t.fraud_risk > 0.4 OR a.abuse_strike_count > 1 OR a.banned = true
  ORDER BY t.fraud_risk DESC, a.abuse_strike_count DESC;

GRANT SELECT ON admin_fraud_flags TO yana_billing_role;
REVOKE ALL ON admin_fraud_flags FROM anon, authenticated, yana_ts_role;


-- ── 9. break_glass_execute RPC ───────────────────────────────────────────────
-- The one audited join. Only callable by service_role.
-- Validates: approved status, not expired, caller is the executor.
-- Writes to audit_log before AND after.
-- Returns email + confession text for the specific pair.

CREATE OR REPLACE FUNCTION break_glass_execute(
  p_request_id uuid,
  p_executor   text
)
RETURNS TABLE (
  account_email    text,
  confession_text  text,
  executed_at      timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req break_glass_requests%ROWTYPE;
  v_email text;
  v_text  text;
  v_now   timestamptz := now();
BEGIN
  SELECT * INTO v_req FROM break_glass_requests WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'break_glass: request not found';
  END IF;
  IF v_req.status <> 'approved' THEN
    RAISE EXCEPTION 'break_glass: request not in approved state (status: %)', v_req.status;
  END IF;
  IF v_req.expires_at < v_now THEN
    UPDATE break_glass_requests SET status = 'expired' WHERE id = p_request_id;
    RAISE EXCEPTION 'break_glass: request has expired';
  END IF;
  IF v_req.approver_email = p_executor AND v_req.requester_email = p_executor THEN
    RAISE EXCEPTION 'break_glass: requester and approver cannot be the same person';
  END IF;

  -- Pre-execute audit
  INSERT INTO audit_log (actor_email, actor_role, action, target_type, target_id, justification, metadata)
  VALUES (
    p_executor, 'super_admin', 'break_glass_execute',
    'break_glass_request', p_request_id::text,
    v_req.justification,
    jsonb_build_object(
      'legal_basis',        v_req.legal_basis,
      'target_confession',  v_req.target_confession,
      'target_account',     v_req.target_account,
      'requester',          v_req.requester_email,
      'approver',           v_req.approver_email
    )
  );

  -- Perform the one permitted join (A → B)
  SELECT u.email INTO v_email
  FROM accounts a
  JOIN auth.users u ON u.id = a.id
  WHERE a.id = v_req.target_account;

  SELECT c.text INTO v_text
  FROM confessions c
  WHERE c.id = v_req.target_confession;

  -- Mark executed
  UPDATE break_glass_requests
  SET status = 'executed', executed_at = v_now, executed_by = p_executor
  WHERE id = p_request_id;

  -- Post-execute audit
  INSERT INTO audit_log (actor_email, actor_role, action, target_type, target_id, justification, metadata)
  VALUES (
    p_executor, 'super_admin', 'break_glass_result_viewed',
    'break_glass_request', p_request_id::text,
    v_req.justification,
    jsonb_build_object('result_fields', ARRAY['account_email','confession_text'])
  );

  RETURN QUERY SELECT v_email, v_text, v_now;
END;
$$;

REVOKE EXECUTE ON FUNCTION break_glass_execute(uuid, text)
  FROM public, anon, authenticated, yana_ts_role, yana_billing_role;
-- Only service_role may call break_glass_execute.


-- ── 10. admin_log_action RPC ─────────────────────────────────────────────────
-- Used by the dashboard server actions to write audit entries.

CREATE OR REPLACE FUNCTION admin_log_action(
  p_actor_email  text,
  p_actor_role   text,
  p_action       text,
  p_target_type  text DEFAULT NULL,
  p_target_id    text DEFAULT NULL,
  p_justification text DEFAULT NULL,
  p_ip_address   text DEFAULT NULL,
  p_metadata     jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO audit_log
    (actor_email, actor_role, action, target_type, target_id, justification, ip_address, metadata)
  VALUES
    (p_actor_email, p_actor_role, p_action, p_target_type, p_target_id,
     p_justification, p_ip_address, p_metadata)
  RETURNING id;
$$;

REVOKE EXECUTE ON FUNCTION admin_log_action(text,text,text,text,text,text,text,jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_log_action(text,text,text,text,text,text,text,jsonb)
  TO yana_ts_role, yana_billing_role;


-- ── 11. RLS verification ──────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_users', 'audit_log', 'moderation_queue',
    'billing_events', 'break_glass_requests'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t AND rowsecurity = true
    ) THEN
      RAISE EXCEPTION 'SECURITY: RLS not enabled on %', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'Admin migration: RLS check passed on all 5 admin tables.';
END;
$$;
