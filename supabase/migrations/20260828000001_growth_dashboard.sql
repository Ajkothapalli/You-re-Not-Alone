-- ============================================================
-- GROWTH & HEALTH DASHBOARD (2026-08-28)
--
-- Owner-only · aggregate counts only
-- NEVER exposes: confession text · account_id↔confession link · author_token
--
-- Access strategy: Metabase connected via a READ-ONLY Postgres role
-- (soulyap_dashboard) that has SELECT on ONLY the six v_* views below.
-- NO grant on confessions, accounts, or any base table.
--
-- Views created here:
--   v_metrics_daily   — daily DAU, new users, yaps, reads, felts, shares, crisis, mod
--   v_funnel          — cohort activation + D1/D7/D30 retention + subscription
--   v_liquidity       — pool health by category × lang, match quality
--   v_virality        — share loop: in-app shares, web clicks, attributed installs, k-factor
--   v_monetization    — premium conversion, MRR by territory (RevenueCat)
--   v_safety          — moderation rate, reports, CSAM count, crisis rate
-- ============================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 0  Supporting tables
-- ─────────────────────────────────────────────────────────────────────────────

-- growth_events: web-side funnel events received by the `track` Edge Function.
-- Source bucket ('match'|'rtue'|'read') is the ONLY non-numeric payload.
-- NO account_id, NO confession text.
CREATE TABLE IF NOT EXISTS growth_events (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type       text        NOT NULL
               CHECK (type IN ('share_click', 'install_attributed')),
  source     text        NOT NULL DEFAULT 'unknown'
               CHECK (source IN ('match', 'rtue', 'read', 'unknown'))
);
ALTER TABLE growth_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON growth_events FROM anon, authenticated;

-- revenue_events: one row per RevenueCat billing event, written by revenuecat-webhook.
-- account_id kept for idempotency / duplicate-event detection ONLY.
-- It is NEVER joined to confessions in any view.
CREATE TABLE IF NOT EXISTS revenue_events (
  id         uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz    NOT NULL DEFAULT now(),
  account_id uuid           REFERENCES accounts(id) ON DELETE SET NULL,
  event_type text           NOT NULL,
  product_id text,
  amount_usd numeric(10, 4) NOT NULL DEFAULT 0,
  currency   text           NOT NULL DEFAULT 'USD',
  territory  text           NOT NULL DEFAULT 'XX'
);
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON revenue_events FROM anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1  Read-only dashboard role
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'soulyap_dashboard') THEN
    CREATE ROLE soulyap_dashboard NOLOGIN;
  END IF;
END
$$;

-- Ensure the role has ZERO access to base tables before granting view access.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM soulyap_dashboard;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM soulyap_dashboard;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2  v_metrics_daily
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per calendar day (rolling 365 days).
-- Output columns: day, dau, new_accounts, yaps, reads, felts, shares,
--                 crisis_count, moderation_blocked
-- NO text columns. NO bare account_id.

DROP VIEW IF EXISTS v_metrics_daily CASCADE;
CREATE VIEW v_metrics_daily AS
WITH dates AS (
  SELECT generate_series(
    GREATEST(
      COALESCE((SELECT MIN(created_at)::date FROM accounts), CURRENT_DATE - 365),
      CURRENT_DATE - 365
    ),
    CURRENT_DATE,
    '1 day'::interval
  )::date AS day
),
da AS (                                        -- daily new accounts
  SELECT created_at::date AS day, COUNT(*) AS new_accounts
  FROM   accounts
  GROUP BY 1
),
dy AS (                                        -- daily user yaps submitted
  SELECT created_at::date AS day, COUNT(*) AS yaps
  FROM   confessions
  WHERE  source = 'user'
  GROUP BY 1
),
dr AS (                                        -- daily read signals
  SELECT
    created_at::date                                        AS day,
    COUNT(DISTINCT reader_account_id)                       AS dau,
    COUNT(*) FILTER (WHERE signal = 'impression')           AS reads,
    COUNT(*) FILTER (WHERE signal = 'felt')                 AS felts,
    COUNT(*) FILTER (WHERE signal = 'share')                AS shares
  FROM read_events
  GROUP BY 1
),
dc AS (                                        -- daily crisis events
  SELECT created_at::date AS day, COUNT(*) AS crisis_count
  FROM   crisis_events
  GROUP BY 1
),
dm AS (                                        -- daily moderation blocks
  SELECT
    created_at::date AS day,
    COUNT(*)         AS moderation_blocked
  FROM edge_function_events
  WHERE function_name = 'submit-confession'
    AND success = false
    AND error_code NOT IN ('rate_limited', 'auth_failed', 'bad_request')
  GROUP BY 1
)
SELECT
  d.day,
  COALESCE(dr.dau,                0)           AS dau,
  COALESCE(da.new_accounts,       0)           AS new_accounts,
  COALESCE(dy.yaps,               0)           AS yaps,
  COALESCE(dr.reads,              0)           AS reads,
  COALESCE(dr.felts,              0)           AS felts,
  COALESCE(dr.shares,             0)           AS shares,
  COALESCE(dc.crisis_count,       0)           AS crisis_count,
  COALESCE(dm.moderation_blocked, 0)           AS moderation_blocked
FROM        dates d
LEFT JOIN   da  ON da.day  = d.day
LEFT JOIN   dy  ON dy.day  = d.day
LEFT JOIN   dr  ON dr.day  = d.day
LEFT JOIN   dc  ON dc.day  = d.day
LEFT JOIN   dm  ON dm.day  = d.day
ORDER BY d.day DESC;

REVOKE ALL    ON v_metrics_daily FROM anon, authenticated;
GRANT  SELECT ON v_metrics_daily TO   soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3  v_funnel
-- ─────────────────────────────────────────────────────────────────────────────
-- Cohort by ISO signup week.
-- Internal CTEs join accounts ↔ read_events ↔ confessions via account_id to
-- count events per cohort — ALL output columns are aggregate counts / ratios;
-- no row-level account_id or confession text appears in the result set.

DROP VIEW IF EXISTS v_funnel CASCADE;
CREATE VIEW v_funnel AS
WITH cohort AS (
  SELECT
    id                                          AS account_id,
    date_trunc('week', created_at)::date        AS signup_week,
    created_at                                  AS signup_at
  FROM accounts
),
onboarded AS (                                  -- had ≥1 impression
  SELECT DISTINCT reader_account_id
  FROM read_events
  WHERE signal = 'impression'
),
first_yap AS (                                  -- wrote ≥1 user confession
  SELECT DISTINCT account_id
  FROM confessions
  WHERE source = 'user' AND account_id IS NOT NULL
),
d1 AS (                                         -- active on exact day 1 after signup
  SELECT DISTINCT re.reader_account_id
  FROM read_events re
  JOIN cohort c ON c.account_id = re.reader_account_id
  WHERE re.created_at >= c.signup_at + INTERVAL '1 day'
    AND re.created_at <  c.signup_at + INTERVAL '2 days'
),
d7 AS (                                         -- active on exact day 7
  SELECT DISTINCT re.reader_account_id
  FROM read_events re
  JOIN cohort c ON c.account_id = re.reader_account_id
  WHERE re.created_at >= c.signup_at + INTERVAL '7 days'
    AND re.created_at <  c.signup_at + INTERVAL '8 days'
),
d30 AS (                                        -- active on exact day 30
  SELECT DISTINCT re.reader_account_id
  FROM read_events re
  JOIN cohort c ON c.account_id = re.reader_account_id
  WHERE re.created_at >= c.signup_at + INTERVAL '30 days'
    AND re.created_at <  c.signup_at + INTERVAL '31 days'
),
premium AS (
  SELECT account_id
  FROM entitlements
  WHERE is_premium = true
    AND (expires_at IS NULL OR expires_at > now())
)
SELECT
  c.signup_week,
  COUNT(DISTINCT c.account_id)                                        AS cohort_size,
  COUNT(DISTINCT o.reader_account_id)                                 AS onboarded,
  COUNT(DISTINCT fy.account_id)                                       AS first_yap_count,
  COUNT(DISTINCT d1.reader_account_id)                                AS d1_retained,
  COUNT(DISTINCT d7.reader_account_id)                                AS d7_retained,
  COUNT(DISTINCT d30.reader_account_id)                               AS d30_retained,
  COUNT(DISTINCT p.account_id)                                        AS subscribed,
  ROUND(COUNT(DISTINCT o.reader_account_id)::numeric  / NULLIF(COUNT(DISTINCT c.account_id), 0), 4)  AS pct_onboarded,
  ROUND(COUNT(DISTINCT fy.account_id)::numeric        / NULLIF(COUNT(DISTINCT c.account_id), 0), 4)  AS pct_first_yap,
  ROUND(COUNT(DISTINCT d1.reader_account_id)::numeric / NULLIF(COUNT(DISTINCT c.account_id), 0), 4)  AS pct_d1,
  ROUND(COUNT(DISTINCT d7.reader_account_id)::numeric / NULLIF(COUNT(DISTINCT c.account_id), 0), 4)  AS pct_d7,
  ROUND(COUNT(DISTINCT d30.reader_account_id)::numeric / NULLIF(COUNT(DISTINCT c.account_id), 0), 4) AS pct_d30,
  ROUND(COUNT(DISTINCT p.account_id)::numeric         / NULLIF(COUNT(DISTINCT c.account_id), 0), 4)  AS pct_subscribed
FROM cohort c
LEFT JOIN onboarded o   ON o.reader_account_id   = c.account_id
LEFT JOIN first_yap fy  ON fy.account_id          = c.account_id
LEFT JOIN d1        d1  ON d1.reader_account_id   = c.account_id
LEFT JOIN d7        d7  ON d7.reader_account_id   = c.account_id
LEFT JOIN d30       d30 ON d30.reader_account_id  = c.account_id
LEFT JOIN premium   p   ON p.account_id            = c.account_id
GROUP BY c.signup_week
ORDER BY c.signup_week DESC;

REVOKE ALL    ON v_funnel FROM anon, authenticated;
GRANT  SELECT ON v_funnel TO   soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 4  v_liquidity
-- ─────────────────────────────────────────────────────────────────────────────
-- Pool health, one row per (category × lang).
-- Output: category, lang, live_count, live_user, live_generated,
--         avg_felt, orphan_count, orphan_rate, real_match_ratio_30d
-- NO text column from confessions (categories is a metadata tag, not content).

DROP VIEW IF EXISTS v_liquidity CASCADE;
CREATE VIEW v_liquidity AS
WITH match_types AS (
  SELECT
    CASE WHEN c.source = 'user' THEN 'real' ELSE 'generated' END AS match_type,
    COUNT(*) AS cnt
  FROM matches m
  JOIN confessions c ON c.id = m.shown_confession_id
  WHERE m.created_at > now() - INTERVAL '30 days'
    AND m.shown_confession_id IS NOT NULL
  GROUP BY 1
),
global_real_ratio AS (
  SELECT ROUND(
    COALESCE(SUM(cnt) FILTER (WHERE match_type = 'real'), 0)::numeric /
    NULLIF(SUM(cnt), 0),
  4) AS ratio
  FROM match_types
)
SELECT
  COALESCE(c.categories[1], 'uncategorized')              AS category,
  COALESCE(c.lang, 'unknown')                             AS lang,
  COUNT(*) FILTER (WHERE c.status IN ('live', 'approved'))                               AS live_count,
  COUNT(*) FILTER (WHERE c.source = 'user'                AND c.status IN ('live', 'approved'))    AS live_user,
  COUNT(*) FILTER (WHERE c.source IN ('seed', 'generated') AND c.status IN ('live', 'approved'))   AS live_generated,
  ROUND(AVG(c.felt_count) FILTER (WHERE c.status IN ('live', 'approved')), 2)            AS avg_felt,
  COUNT(*) FILTER (WHERE c.felt_count = 0                 AND c.status IN ('live', 'approved'))    AS orphan_count,
  ROUND(
    COUNT(*) FILTER (WHERE c.felt_count = 0 AND c.status IN ('live', 'approved'))::numeric /
    NULLIF(COUNT(*) FILTER (WHERE c.status IN ('live', 'approved')), 0),
  4)                                                                                     AS orphan_rate,
  (SELECT ratio FROM global_real_ratio)                                                  AS real_match_ratio_30d
FROM confessions c
GROUP BY 1, 2
ORDER BY live_count DESC;

REVOKE ALL    ON v_liquidity FROM anon, authenticated;
GRANT  SELECT ON v_liquidity TO   soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 5  v_virality
-- ─────────────────────────────────────────────────────────────────────────────
-- Share loop metrics by source bucket.
-- in_app_shares: from read_events (signal='share') — no source bucket available
-- share_clicks + install_attributed: from growth_events (web beacon / app callback)
-- k_factor: attributed installs / in-app shares (proxy for viral coefficient)
-- Output: source, share_clicks, installs_attributed, cvr_or_k

DROP VIEW IF EXISTS v_virality CASCADE;
CREATE VIEW v_virality AS
WITH by_bucket AS (
  SELECT
    source,
    COUNT(*) FILTER (WHERE type = 'share_click')        AS share_clicks,
    COUNT(*) FILTER (WHERE type = 'install_attributed') AS installs_attributed
  FROM growth_events
  GROUP BY 1
),
in_app_total AS (
  SELECT COUNT(*) AS shares FROM read_events WHERE signal = 'share'
),
totals AS (
  SELECT
    '_all'                           AS source,
    SUM(bb.share_clicks)             AS share_clicks,
    SUM(bb.installs_attributed)      AS installs_attributed,
    (SELECT shares FROM in_app_total) AS in_app_shares
  FROM by_bucket bb
)
-- Per-bucket rows: CVR = installs / clicks (landing-page conversion)
SELECT
  bb.source,
  bb.share_clicks,
  bb.installs_attributed,
  ROUND(bb.installs_attributed::numeric / NULLIF(bb.share_clicks, 0), 4) AS cvr_click_to_install,
  NULL::numeric                                                            AS k_factor
FROM by_bucket bb
UNION ALL
-- Summary row: k-factor = attributed_installs / in-app shares
SELECT
  t.source,
  t.share_clicks,
  t.installs_attributed,
  ROUND(t.installs_attributed::numeric / NULLIF(t.share_clicks, 0), 4)  AS cvr_click_to_install,
  ROUND(t.installs_attributed::numeric / NULLIF(t.in_app_shares, 0), 4) AS k_factor
FROM totals t
ORDER BY source;

REVOKE ALL    ON v_virality FROM anon, authenticated;
GRANT  SELECT ON v_virality TO   soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 6  v_monetization
-- ─────────────────────────────────────────────────────────────────────────────
-- Premium subscription and MRR from revenue_events (RevenueCat webhook).
-- territory from RevenueCat event payload — never from accounts (no PII linkage).
-- account_id in revenue_events is for dedup; it is NEVER joined to confessions.

DROP VIEW IF EXISTS v_monetization CASCADE;
CREATE VIEW v_monetization AS
WITH active AS (
  SELECT COUNT(*) AS subs
  FROM entitlements
  WHERE is_premium = true
    AND (expires_at IS NULL OR expires_at > now())
),
total_accts AS (
  SELECT COUNT(*) AS cnt FROM accounts
)
SELECT
  COALESCE(re.territory, 'XX')               AS territory,
  SUM(re.amount_usd)                         AS mrr_usd,
  COUNT(DISTINCT re.account_id)              AS paying_accounts_mtd,
  (SELECT subs FROM active)                  AS active_subs,
  ROUND((SELECT subs FROM active)::numeric /
        NULLIF((SELECT cnt FROM total_accts), 0), 4) AS conversion_pct
FROM revenue_events re
WHERE re.event_type IN (
    'INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION',
    'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED'
  )
  AND re.created_at >= date_trunc('month', now())
GROUP BY re.territory
ORDER BY mrr_usd DESC NULLS LAST;

REVOKE ALL    ON v_monetization FROM anon, authenticated;
GRANT  SELECT ON v_monetization TO   soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 7  v_safety
-- ─────────────────────────────────────────────────────────────────────────────
-- Single-row safety scorecard (7d and 30d windows side by side).
-- CSAM counted from edge_function_events only — no confession text.

DROP VIEW IF EXISTS v_safety CASCADE;
CREATE VIEW v_safety AS
WITH sub AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')   AS cnt_7d,
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')  AS cnt_30d
  FROM confessions WHERE source = 'user'
),
mod AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')   AS cnt_7d,
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')  AS cnt_30d
  FROM edge_function_events
  WHERE function_name = 'submit-confession'
    AND success = false
    AND error_code NOT IN ('rate_limited', 'auth_failed', 'bad_request')
),
csam AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')   AS cnt_7d,
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')  AS cnt_30d
  FROM edge_function_events
  WHERE error_code = 'csam'
),
rep AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')   AS cnt_7d,
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')  AS cnt_30d,
    ROUND(
      PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at)) * 1000
      ) FILTER (WHERE resolved = true AND resolved_at IS NOT NULL)
    ) AS median_review_ms
  FROM reports
),
cri AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')   AS cnt_7d,
    COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days')  AS cnt_30d
  FROM crisis_events
),
live_pool AS (
  SELECT COUNT(*) AS cnt FROM confessions WHERE status IN ('live', 'approved')
)
SELECT
  sub.cnt_7d                                                      AS submissions_7d,
  sub.cnt_30d                                                     AS submissions_30d,
  mod.cnt_7d                                                      AS moderation_blocked_7d,
  mod.cnt_30d                                                     AS moderation_blocked_30d,
  ROUND(mod.cnt_7d::numeric  / NULLIF(sub.cnt_7d, 0),  4)        AS flagged_pct_7d,
  ROUND(mod.cnt_30d::numeric / NULLIF(sub.cnt_30d, 0), 4)        AS flagged_pct_30d,
  csam.cnt_7d                                                     AS csam_7d,
  csam.cnt_30d                                                    AS csam_30d,
  rep.cnt_7d                                                      AS reports_7d,
  rep.cnt_30d                                                     AS reports_30d,
  ROUND(rep.cnt_7d::numeric  / NULLIF(lp.cnt, 0), 6)             AS report_rate_7d,
  COALESCE(rep.median_review_ms, 0)                               AS median_review_ms,
  cri.cnt_7d                                                      AS crisis_7d,
  cri.cnt_30d                                                     AS crisis_30d
FROM sub
CROSS JOIN mod
CROSS JOIN csam
CROSS JOIN rep
CROSS JOIN cri
CROSS JOIN live_pool lp;

REVOKE ALL    ON v_safety FROM anon, authenticated;
GRANT  SELECT ON v_safety TO   soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 8  Final GRANT — views only, never base tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Belt-and-suspenders: explicitly confirm no base-table access for the role.
-- (These lines are intentional no-ops if the REVOKE ALL above ran correctly,
--  but they make the intent auditable.)
REVOKE ALL ON confessions        FROM soulyap_dashboard;
REVOKE ALL ON accounts           FROM soulyap_dashboard;
REVOKE ALL ON read_events        FROM soulyap_dashboard;
REVOKE ALL ON crisis_events      FROM soulyap_dashboard;
REVOKE ALL ON matches            FROM soulyap_dashboard;
REVOKE ALL ON reports            FROM soulyap_dashboard;
REVOKE ALL ON edge_function_events FROM soulyap_dashboard;
REVOKE ALL ON entitlements       FROM soulyap_dashboard;
REVOKE ALL ON revenue_events     FROM soulyap_dashboard;
REVOKE ALL ON growth_events      FROM soulyap_dashboard;

-- The six views are the ONLY grant.
GRANT SELECT ON v_metrics_daily  TO soulyap_dashboard;
GRANT SELECT ON v_funnel         TO soulyap_dashboard;
GRANT SELECT ON v_liquidity      TO soulyap_dashboard;
GRANT SELECT ON v_virality       TO soulyap_dashboard;
GRANT SELECT ON v_monetization   TO soulyap_dashboard;
GRANT SELECT ON v_safety         TO soulyap_dashboard;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 9  Verification assertions (run at migration time)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v text;
  col_count int;
BEGIN
  -- Each v_* view must exist.
  FOREACH v IN ARRAY ARRAY[
    'v_metrics_daily','v_funnel','v_liquidity','v_virality','v_monetization','v_safety'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.views
      WHERE table_schema = 'public' AND table_name = v
    ) THEN
      RAISE EXCEPTION 'DASHBOARD: view % was not created', v;
    END IF;

    -- No text or varchar column must appear in the view output.
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = v
      AND data_type IN ('text', 'character varying')
      AND column_name NOT IN ('day', 'category', 'lang', 'territory', 'source');
    IF col_count > 0 THEN
      RAISE EXCEPTION 'DASHBOARD: view % has unexpected text column(s)', v;
    END IF;
  END LOOP;

  -- soulyap_dashboard must not have any privilege on base tables.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'soulyap_dashboard'
      AND table_name IN ('confessions','accounts','read_events','crisis_events',
                         'matches','reports','edge_function_events')
  ) THEN
    RAISE EXCEPTION 'DASHBOARD: soulyap_dashboard has unexpected base-table privilege';
  END IF;

  RAISE NOTICE 'DASHBOARD: all view and permission assertions passed.';
END
$$;
