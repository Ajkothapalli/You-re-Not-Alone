-- ============================================================
-- OPS METRICS VIEWS
-- Sourced from: edge function telemetry written by submit-confession.
-- World A (yana_ts_role) — no account_id or email ever included.
-- ============================================================


-- ── 1. edge_function_events ──────────────────────────────────────────────────
-- Telemetry written by edge functions for ops observability.
-- IDs and latency only — no confession text, no account_id.

CREATE TABLE IF NOT EXISTS edge_function_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  function_name   text        NOT NULL,   -- 'submit-confession', 'recommend', ...
  pipeline_step   text,                   -- 'moderation', 'embedding', 'match', ...
  duration_ms     int,
  success         bool        NOT NULL DEFAULT true,
  error_code      text,                   -- NULL if success
  confession_id   uuid,                   -- set on successful submissions only
  metadata        jsonb NOT NULL DEFAULT '{}'
);

ALTER TABLE edge_function_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON edge_function_events FROM anon, authenticated;
GRANT SELECT ON edge_function_events TO yana_ts_role;
REVOKE ALL ON edge_function_events FROM yana_billing_role;


-- ── 2. admin_ops_metrics (24h rolling) ───────────────────────────────────────

CREATE OR REPLACE VIEW admin_ops_metrics AS
  SELECT
    count(*) FILTER (WHERE success = true AND function_name = 'submit-confession')
      AS submissions_24h,

    percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)
      FILTER (WHERE pipeline_step = 'moderation' AND created_at > now() - interval '24h')
      AS moderation_p50_ms,

    percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)
      FILTER (WHERE pipeline_step = 'moderation' AND created_at > now() - interval '24h')
      AS moderation_p99_ms,

    percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms)
      FILTER (WHERE pipeline_step = 'embedding' AND created_at > now() - interval '24h')
      AS embedding_p50_ms,

    percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms)
      FILTER (WHERE pipeline_step = 'embedding' AND created_at > now() - interval '24h')
      AS embedding_p99_ms,

    round(
      count(*) FILTER (WHERE success = false AND function_name = 'submit-confession'
                         AND created_at > now() - interval '24h')::numeric
      / nullif(count(*) FILTER (WHERE function_name = 'submit-confession'
                                  AND created_at > now() - interval '24h'), 0),
    4) AS block_rate_24h,

    round(
      count(*) FILTER (WHERE error_code = 'crisis' AND created_at > now() - interval '24h')::numeric
      / nullif(count(*) FILTER (WHERE function_name = 'submit-confession'
                                  AND created_at > now() - interval '24h'), 0),
    4) AS crisis_rate_24h,

    round(
      count(DISTINCT confession_id) FILTER (
        WHERE confession_id IS NOT NULL AND created_at > now() - interval '24h'
      )::numeric
      / nullif(
        count(*) FILTER (WHERE function_name = 'submit-confession' AND success = true
                           AND created_at > now() - interval '24h'), 0),
    4) AS match_rate_24h

  FROM edge_function_events
  WHERE created_at > now() - interval '24h';

GRANT SELECT ON admin_ops_metrics TO yana_ts_role;
REVOKE ALL ON admin_ops_metrics FROM anon, authenticated, yana_billing_role;


-- ── 3. admin_queue_depths ─────────────────────────────────────────────────────
-- Pending item counts per queue — defined as static view over live table counts.

CREATE OR REPLACE VIEW admin_queue_depths AS
  SELECT 'moderation_queue'     AS queue_name, count(*) FILTER (WHERE status = 'pending') AS depth
    FROM moderation_queue
  UNION ALL
  SELECT 'break_glass_pending'  AS queue_name, count(*) AS depth
    FROM break_glass_requests WHERE status = 'pending'
  UNION ALL
  SELECT 'crisis_unreviewed'    AS queue_name, count(*) AS depth
    FROM crisis_events WHERE reviewed = false;

GRANT SELECT ON admin_queue_depths TO yana_ts_role;
REVOKE ALL ON admin_queue_depths FROM anon, authenticated, yana_billing_role;


-- ── 4. admin_edge_errors ─────────────────────────────────────────────────────
-- Error counts bucketed by hour, function, and error code.

CREATE OR REPLACE VIEW admin_edge_errors AS
  SELECT
    date_trunc('hour', created_at)  AS bucket,
    function_name,
    error_code,
    count(*)                         AS error_count
  FROM edge_function_events
  WHERE success = false
    AND created_at > now() - interval '7 days'
  GROUP BY 1, 2, 3
  ORDER BY 1 DESC, 4 DESC;

GRANT SELECT ON admin_edge_errors TO yana_ts_role;
REVOKE ALL ON admin_edge_errors FROM anon, authenticated, yana_billing_role;


-- ── 5. Fix admin_fraud_flags: compute trust_score ────────────────────────────
-- The original view returned trust_alpha/trust_beta; the dashboard expects trust_score.

DROP VIEW IF EXISTS admin_fraud_flags CASCADE;
CREATE OR REPLACE VIEW admin_fraud_flags AS
  SELECT
    a.id          AS account_id,
    u.email,
    t.fraud_risk,
    CASE WHEN (t.trust_alpha + t.trust_beta) > 0
      THEN round((t.trust_alpha / (t.trust_alpha + t.trust_beta))::numeric, 3)
      ELSE 0.5
    END            AS trust_score,
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
