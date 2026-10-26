-- ─────────────────────────────────────────────────────────────────────────────
-- [N1] Grant rate per moment — granted ÷ shown.
--
-- No A/B test. The three moments are compared against each other, and the
-- question being asked is a narrow one: WHICH MOMENT IS WORTH SPENDING THE
-- ONE DIALOG ON. Somebody who declines at moment C is not asked again for
-- 14 days, so a moment with a poor grant rate is not just less effective —
-- it is actively burning the chances of the other two.
--
-- ── WHERE TO RUN THIS: NOT HERE ─────────────────────────────────────────────
--
-- The push_ask_* events go to PostHog, not to this database. lib/analytics.ts
-- posts to app.posthog.com/capture, and the `analytics_events` table in this
-- project is empty and written by nothing.
--
-- AND, as found while writing S1: EXPO_PUBLIC_ANALYTICS_KEY is absent from
-- eas.json, so `track()` returns early in every build and NOTHING HAS EVER
-- BEEN SENT. Until that key is added to eas.json's build env and to the OTA
-- workflow secrets, this query has no data anywhere — the events are
-- computed, formatted and thrown away.
--
-- So: the SQL below is written against the shape the events would land in,
-- and the PostHog HogQL equivalent is underneath it. Fix the key first.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── If the events are ever landed in Postgres (analytics_events) ────────────
--
-- Shape assumed: name text, props jsonb, created_at timestamptz.

WITH bounds AS (
  SELECT date '2026-09-30' AS from_day, date '2026-10-14' AS to_day
),
shown AS (
  SELECT props->>'moment' AS moment, count(*) AS n
  FROM   analytics_events, bounds b
  WHERE  name = 'push_ask_shown'
    AND  created_at >= b.from_day AND created_at < b.to_day
  GROUP BY 1
),
granted AS (
  SELECT props->>'moment' AS moment, count(*) AS n
  FROM   analytics_events, bounds b
  WHERE  name = 'push_permission'
    AND  props->>'result' = 'granted'
    AND  created_at >= b.from_day AND created_at < b.to_day
  GROUP BY 1
),
tapped_yes AS (
  SELECT props->>'moment' AS moment, count(*) AS n
  FROM   analytics_events, bounds b
  WHERE  name = 'push_ask_choice'
    AND  props->>'choice' = 'yes'
    AND  created_at >= b.from_day AND created_at < b.to_day
  GROUP BY 1
)
SELECT
  s.moment,
  s.n                                                   AS shown,
  COALESCE(t.n, 0)                                      AS tapped_yes,
  COALESCE(g.n, 0)                                      AS granted,
  -- The headline number: of the people shown this card, how many ended up
  -- with notifications on.
  ROUND(100.0 * COALESCE(g.n, 0) / NULLIF(s.n, 0), 1)   AS grant_rate_pct,
  -- Split in two, because they fail for different reasons and the fix is
  -- different. A low card rate means the WORDS or the MOMENT are wrong; a
  -- low dialog rate means the card over-promised and the OS prompt came as
  -- a surprise.
  ROUND(100.0 * COALESCE(t.n, 0) / NULLIF(s.n, 0), 1)   AS card_yes_pct,
  ROUND(100.0 * COALESCE(g.n, 0) / NULLIF(t.n, 0), 1)   AS dialog_grant_pct
FROM      shown s
LEFT JOIN granted    g USING (moment)
LEFT JOIN tapped_yes t USING (moment)
ORDER BY  grant_rate_pct DESC NULLS LAST;


-- ── PostHog (HogQL), which is where the events actually go today ────────────
--
--   SELECT
--     properties.moment AS moment,
--     countIf(event = 'push_ask_shown')                                AS shown,
--     countIf(event = 'push_ask_choice' AND properties.choice = 'yes') AS tapped_yes,
--     countIf(event = 'push_permission' AND properties.result = 'granted') AS granted,
--     round(100.0 * countIf(event = 'push_permission'
--           AND properties.result = 'granted')
--           / nullIf(countIf(event = 'push_ask_shown'), 0), 1)         AS grant_rate_pct
--   FROM events
--   WHERE event IN ('push_ask_shown', 'push_ask_choice', 'push_permission')
--     AND timestamp >= now() - INTERVAL 14 DAY
--   GROUP BY moment
--   ORDER BY grant_rate_pct DESC
--
-- ── Reading it ──────────────────────────────────────────────────────────────
-- Do not compare moments until each has at least ~100 shows. Below that the
-- difference between 40% and 55% is noise, and a number quoted once gets
-- quoted again — the same reason S1 does not run an A/B split yet.
-- ─────────────────────────────────────────────────────────────────────────────
