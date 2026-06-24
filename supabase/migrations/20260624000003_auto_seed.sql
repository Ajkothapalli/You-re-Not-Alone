-- ============================================================
-- Daily auto-story config + view fix + dedup helper
--
-- Control:
--   UPDATE seed_config SET enabled = false WHERE id = 1;  -- stop instantly
--   UPDATE seed_config SET per_category = 3 WHERE id = 1; -- reduce volume
--   DELETE FROM confessions WHERE author_token = HMAC('soulyap:auto', SECRET);  -- retire
--
-- Identity: auto confessions are identified server-side only by their
-- author_token (HMAC). They are indistinguishable from real confessions
-- in confessions_public — no user-visible flag ever.
-- ============================================================


-- ── 1. seed_config singleton ──────────────────────────────────────────────────
-- Single row (id=1) — the off switch. Flip enabled=false, no redeploy needed.

CREATE TABLE IF NOT EXISTS seed_config (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled      boolean NOT NULL DEFAULT true,
  per_category integer NOT NULL DEFAULT 5,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO seed_config (id, enabled, per_category)
VALUES (1, true, 5)
ON CONFLICT (id) DO NOTHING;

-- service_role only — clients never see or touch this
REVOKE ALL ON seed_config FROM anon, authenticated;


-- ── 2. Fix confessions_public: remove is_seed ─────────────────────────────────
-- is_seed must NOT be visible to clients. The column stays on the base table
-- (server-only) for the recommender penalty. The public view exposes only what
-- the client actually needs: id, text, felt_count, categories, created_at.

DROP VIEW IF EXISTS confessions_public CASCADE;

CREATE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at
  FROM   confessions
  WHERE  status = 'live';

REVOKE ALL ON confessions_public FROM anon, authenticated;
GRANT SELECT ON confessions_public TO anon, authenticated;


-- ── 3. check_confession_duplicate ────────────────────────────────────────────
-- Returns true if any live confession is too similar (cosine similarity above
-- p_threshold) to the candidate embedding. Used by push-daily-stories to avoid
-- near-duplicate auto content.

CREATE OR REPLACE FUNCTION check_confession_duplicate(
  p_embedding extensions.vector(1536),
  p_threshold float DEFAULT 0.9
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   confessions
    WHERE  status = 'live'
      AND  embedding IS NOT NULL
      AND  1 - (embedding <=> p_embedding) > p_threshold
    LIMIT 1
  );
$$;

REVOKE EXECUTE ON FUNCTION check_confession_duplicate(extensions.vector(1536), float)
  FROM public, anon, authenticated;


-- ── 4. Schedule (set up via Supabase Dashboard) ───────────────────────────────
-- Dashboard → Edge Functions → push-daily-stories → Schedule
--   Cron:    0 2 * * *   (2 AM UTC daily)
--   Method:  POST
--   Headers: Authorization: Bearer <service_role_key>
--   Body:    {}
--
-- Alternatively via pg_cron + pg_net (requires both extensions enabled):
--
-- SELECT cron.schedule(
--   'push-daily-stories',
--   '0 2 * * *',
--   $cron$
--     SELECT net.http_post(
--       url     := 'https://<project-ref>.supabase.co/functions/v1/push-daily-stories',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
--       ),
--       body := '{}'::jsonb
--     );
--   $cron$
-- );
--
-- Set the service role key once:
--   ALTER DATABASE postgres SET app.service_role_key = '<key>';
