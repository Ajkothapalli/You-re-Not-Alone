-- ─────────────────────────────────────────────────────────────────────────────
-- [S1] Before / after measurement for the swipe stack.
--
-- Run each block on its own. Every one takes a date window at the top so the
-- same file serves the 14-day baseline and the weekly readings afterwards.
--
--   BASELINE  : the 14 days BEFORE the release
--   AFTER     : one week at a time, from the release date onwards
--
-- ── Read this before trusting any of it ─────────────────────────────────────
--
-- 1. THE COMPARISON IS BY DATE, NOT BY LAYOUT COLUMN. Everyone gets the
--    stack at once (that is the point of S1 — no A/B until ~3,000 weekly
--    readers), so "before" and "after" are date ranges and nothing needs a
--    per-row layout tag. The {layout} property now on the client events is
--    for the LATER split; it is not what these queries use, and it is not
--    available here at all — see note 3.
--
-- 2. THERE IS NO SESSION ID ANYWHERE. `read_events` records one row per
--    signal with a timestamp and nothing else, so a "session" has to be
--    inferred. These queries define it as: consecutive events by one reader
--    with no gap longer than SESSION_GAP (30 minutes). That is a choice, not
--    a fact — state it alongside any number produced from it, and keep it
--    identical between the before and after runs or the comparison is
--    meaningless.
--
-- 3. THE CLIENT ANALYTICS EVENTS ARE NOT IN THIS DATABASE. analytics.ts
--    posts to PostHog (app.posthog.com/capture), and the `analytics_events`
--    table in this project is empty and written by nothing. Anything below
--    that would need card_shared, write_invite_tapped or question_* is
--    therefore NOT computable in SQL — see METRIC 4 and the gap note at the
--    bottom.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═════════════════════════════════════════════════════════════════════════════
-- METRIC 1 — Writer conversion
-- The share of weekly READERS who posted one that passed the gate.
--
-- 'unchecked' is NOT a pass (CLAUDE.md [3.6]): it means the meaning check
-- could not run, and counting it as a conversion would make an API outage
-- look like a growth win.
-- ═════════════════════════════════════════════════════════════════════════════

WITH bounds AS (
  SELECT date '2026-09-16' AS from_day, date '2026-09-30' AS to_day
),
readers AS (
  SELECT DISTINCT e.reader_account_id AS account_id
  FROM   read_events e, bounds b
  WHERE  e.created_at >= b.from_day AND e.created_at < b.to_day
),
writers AS (
  SELECT DISTINCT c.account_id
  FROM   confessions c, bounds b
  WHERE  c.created_at >= b.from_day AND c.created_at < b.to_day
    AND  c.account_id IS NOT NULL
    AND  c.source = 'user'
    AND  c.substance_check = 'passed'      -- 'unchecked' is not a pass
    AND  c.status IN ('live', 'approved')
)
SELECT
  (SELECT count(*) FROM readers)                                        AS readers,
  (SELECT count(*) FROM writers w JOIN readers r USING (account_id))    AS readers_who_wrote,
  ROUND(100.0 * (SELECT count(*) FROM writers w JOIN readers r USING (account_id))
        / NULLIF((SELECT count(*) FROM readers), 0), 1)                 AS writer_conversion_pct;


-- ═════════════════════════════════════════════════════════════════════════════
-- METRIC 2 — Cards read to end, per reading session
-- METRIC 3 — Felts per reading session
--
-- One query: both are per-session counts over the same sessionisation, and
-- computing them separately invites the two from drifting apart.
-- ═════════════════════════════════════════════════════════════════════════════

WITH bounds AS (
  SELECT date '2026-09-16' AS from_day, date '2026-09-30' AS to_day,
         interval '30 minutes' AS session_gap
),
ordered AS (
  SELECT
    e.reader_account_id,
    e.signal,
    e.created_at,
    -- A gap longer than session_gap starts a new session.
    CASE WHEN e.created_at - LAG(e.created_at) OVER (
           PARTITION BY e.reader_account_id ORDER BY e.created_at
         ) > (SELECT session_gap FROM bounds)
         OR LAG(e.created_at) OVER (
           PARTITION BY e.reader_account_id ORDER BY e.created_at
         ) IS NULL
    THEN 1 ELSE 0 END AS is_new_session
  FROM read_events e, bounds b
  WHERE e.created_at >= b.from_day AND e.created_at < b.to_day
),
sessioned AS (
  SELECT *, SUM(is_new_session) OVER (
    PARTITION BY reader_account_id ORDER BY created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS session_n
  FROM ordered
),
per_session AS (
  SELECT
    reader_account_id, session_n,
    count(*) FILTER (WHERE signal = 'read_to_end') AS read_to_end,
    count(*) FILTER (WHERE signal = 'felt')        AS felts,
    count(*) FILTER (WHERE signal = 'impression')  AS impressions
  FROM sessioned
  GROUP BY reader_account_id, session_n
)
SELECT
  count(*)                                      AS sessions,
  ROUND(AVG(read_to_end), 2)                    AS avg_read_to_end_per_session,
  -- The median matters more than the mean here: one long session from one
  -- person moves the average and tells you nothing about a typical read.
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY read_to_end) AS median_read_to_end,
  ROUND(AVG(felts), 2)                          AS avg_felts_per_session,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY felts)       AS median_felts,
  ROUND(AVG(impressions), 2)                    AS avg_cards_seen_per_session
FROM per_session;


-- ═════════════════════════════════════════════════════════════════════════════
-- METRIC 4 — Reaching the cap / end page, and "write one to unlock" taps
--
-- NOT COMPUTABLE TODAY. Both halves need a client event, and client events
-- go to PostHog rather than to this database (note 3 above) — and the
-- end-page one does not exist at all, in either place.
--
-- The PROXY below is the closest thing the database can answer: readers who
-- used their whole allowance on a given day. It is not the same question —
-- it counts reads rather than arrivals at the page, so it misses anyone who
-- reached the end because the feed ran out rather than because they were
-- capped — but it moves in the same direction and it is available now.
--
-- See the gap note at the bottom for the smallest event that would answer
-- the real question.
-- ═════════════════════════════════════════════════════════════════════════════

WITH bounds AS (
  SELECT date '2026-09-16' AS from_day, date '2026-09-30' AS to_day, 10 AS daily_allowance
),
per_day AS (
  SELECT
    e.reader_account_id,
    e.created_at::date AS day,
    count(DISTINCT e.confession_id) FILTER (WHERE e.signal = 'impression') AS cards
  FROM read_events e, bounds b
  WHERE e.created_at >= b.from_day AND e.created_at < b.to_day
  GROUP BY 1, 2
)
SELECT
  count(*)                                                          AS reader_days,
  count(*) FILTER (WHERE cards >= (SELECT daily_allowance FROM bounds)) AS reader_days_at_cap,
  ROUND(100.0 * count(*) FILTER (WHERE cards >= (SELECT daily_allowance FROM bounds))
        / NULLIF(count(*), 0), 1)                                   AS pct_reader_days_at_cap
FROM per_day;


-- ═════════════════════════════════════════════════════════════════════════════
-- METRIC 5 — D1 / D7 return
--
-- Activity = any read_event. Cohorted on the day of a reader's FIRST event
-- ever, not on their account creation date: an account that signed up and
-- never read is not a reader who failed to return, it is somebody who never
-- arrived, and mixing the two flatters or damns the number depending on
-- sign-up volume.
-- ═════════════════════════════════════════════════════════════════════════════

WITH bounds AS (
  SELECT date '2026-09-16' AS from_day, date '2026-09-30' AS to_day
),
first_seen AS (
  SELECT reader_account_id, min(created_at)::date AS day0
  FROM   read_events
  GROUP BY 1
),
cohort AS (
  SELECT f.reader_account_id, f.day0
  FROM   first_seen f, bounds b
  WHERE  f.day0 >= b.from_day AND f.day0 < b.to_day
    -- Only cohorts old enough to have HAD a D7 chance. Without this, the
    -- most recent week always looks like a collapse.
    AND  f.day0 <= CURRENT_DATE - 7
),
activity AS (
  SELECT DISTINCT reader_account_id, created_at::date AS day FROM read_events
)
SELECT
  count(*)                                                            AS cohort_size,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM activity a WHERE a.reader_account_id = c.reader_account_id
      AND a.day = c.day0 + 1))                                        AS returned_d1,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM activity a WHERE a.reader_account_id = c.reader_account_id
      AND a.day = c.day0 + 7))                                        AS returned_d7,
  ROUND(100.0 * count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM activity a WHERE a.reader_account_id = c.reader_account_id
      AND a.day = c.day0 + 1)) / NULLIF(count(*), 0), 1)              AS d1_pct,
  ROUND(100.0 * count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM activity a WHERE a.reader_account_id = c.reader_account_id
      AND a.day = c.day0 + 7)) / NULLIF(count(*), 0), 1)              AS d7_pct
FROM cohort c;


-- ═════════════════════════════════════════════════════════════════════════════
-- WHAT CANNOT BE MEASURED, AND THE SMALLEST THING THAT WOULD FIX IT
--
-- (a) "Reached the cap / end page". No event exists, anywhere. The proxy in
--     METRIC 4 counts reads, not arrivals.
--
-- (b) "Write one to unlock" taps. The event EXISTS
--     (write_invite_tapped {kind:'footer'}) but goes to PostHog, and
--     EXPO_PUBLIC_ANALYTICS_KEY is absent from eas.json — so no build has
--     ever sent one. Nothing is being collected.
--
-- (c) Splitting metrics 2, 3 and 5 by LAYOUT. read_events has no layout
--     column. Fine for this release (before/after by date) and NOT fine for
--     the 50/50 split later.
--
-- The smallest addition that fixes (a) and (c) together, ids and counts only:
--
--   CREATE TABLE feed_milestones (
--     account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
--     day        date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
--     kind       text NOT NULL CHECK (kind IN ('end_reached','cap_reached','unlock_tapped')),
--     layout     text NOT NULL CHECK (layout IN ('stack','list')),
--     PRIMARY KEY (account_id, day, kind, layout)
--   );
--
-- One row per account per kind per day per layout. No confession id, no
-- text, no timestamp beyond the day — the same shape as share_opens, and
-- for the same reason: it answers "how many" and cannot answer "who read
-- what, when". The primary key does the de-duplication, so the client can
-- fire it every time without inflating anything.
--
-- (b) is not a code change at all: add EXPO_PUBLIC_ANALYTICS_KEY to
-- eas.json's build env and to the OTA workflow secrets, the same way
-- EXPO_PUBLIC_SUPABASE_URL had to be. Until then every client event in the
-- app is being computed, formatted and thrown away.
-- ═════════════════════════════════════════════════════════════════════════════
