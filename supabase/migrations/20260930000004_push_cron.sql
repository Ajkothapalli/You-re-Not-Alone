-- ─────────────────────────────────────────────────────────────────────────────
-- [N1] The schedules that actually SEND.
--
-- Deliberately a separate migration from the tables (20260930000003_push.sql).
-- Applying the schema is harmless; applying these starts pushing to real
-- phones. They should be two decisions, taken at two moments, and a single
-- migration would make the second one happen by accident with the first.
--
-- ── Three jobs ──────────────────────────────────────────────────────────────
--   push-send      every 10 min   drains push_outbox
--   push-receipts  every 15 min   disables tokens Expo says are dead
--   push-question  hourly         enqueues Monday 19:00 LOCAL, per timezone
--
-- The question job is hourly rather than daily because "Monday evening" is
-- a different instant in every timezone. A single daily run would reach
-- half the world at the wrong hour, and for a notification the wrong hour
-- is the whole problem.
--
-- ── The secret ──────────────────────────────────────────────────────────────
-- send-pushes refuses any request without x-cron-secret. Without that,
-- anybody who found the URL could drain the queue at a time of their
-- choosing — which is a way to defeat quiet hours from outside the system.
--
-- Set both of these once per project, before scheduling:
--   ALTER DATABASE postgres SET app.service_role_key = '<service role key>';
--   ALTER DATABASE postgres SET app.cron_secret      = '<SEED_CRON_SECRET>';
-- ─────────────────────────────────────────────────────────────────────────────

-- Guarded so the migration applies on a project without pg_cron/pg_net
-- rather than failing the whole push feature on an extension.
DO $$
DECLARE
  v_base   text;
  v_key    text;
  v_secret text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
  OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE '[N1] pg_cron or pg_net missing — schedules NOT created. '
                 'Enable both, then re-run this migration.';
    RETURN;
  END IF;

  BEGIN
    v_key    := current_setting('app.service_role_key');
    v_secret := current_setting('app.cron_secret');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[N1] app.service_role_key / app.cron_secret not set — '
                 'schedules NOT created. See the header.';
    RETURN;
  END;

  /**
   * Set explicitly per project, never derived.
   *
   * An earlier draft tried to build this from the database's own settings.
   * There is no reliable server-side way to get the project ref, and a
   * derivation that is wrong by one character would schedule DEV to push
   * through PRODUCTION's function — silently, to real phones. Requiring it
   * to be typed once, per project, makes that impossible to do by accident.
   */
  v_base := current_setting('app.functions_url', true);
  IF v_base IS NULL OR v_base = '' THEN
    RAISE NOTICE '[N1] app.functions_url not set — schedules NOT created. '
                 'Set it to https://<ref>.supabase.co/functions/v1 and re-run.';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobname) FROM cron.job
   WHERE jobname IN ('push-send', 'push-receipts', 'push-question');

  PERFORM cron.schedule('push-send', '*/10 * * * *', format($j$
    SELECT net.http_post(
      url     := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer %s',
        'x-cron-secret', '%s'),
      body    := '{"task":"send"}'::jsonb);
  $j$, v_base || '/send-pushes', v_key, v_secret));

  PERFORM cron.schedule('push-receipts', '*/15 * * * *', format($j$
    SELECT net.http_post(
      url     := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer %s',
        'x-cron-secret', '%s'),
      body    := '{"task":"receipts"}'::jsonb);
  $j$, v_base || '/send-pushes', v_key, v_secret));

  PERFORM cron.schedule('push-question', '5 * * * *', format($j$
    SELECT net.http_post(
      url     := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer %s',
        'x-cron-secret', '%s'),
      body    := '{"task":"question"}'::jsonb);
  $j$, v_base || '/send-pushes', v_key, v_secret));

  RAISE NOTICE '[N1] push schedules created.';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRODUCTION — do NOT run until the DEV device pass is done.
--
--   ALTER DATABASE postgres SET app.service_role_key = '<prod service role key>';
--   ALTER DATABASE postgres SET app.cron_secret      = '<prod SEED_CRON_SECRET>';
--   ALTER DATABASE postgres SET app.functions_url    =
--     'https://sjywjerlqxwfniwqjojs.supabase.co/functions/v1';
--   -- then apply this migration, or paste the DO block above.
--
-- To stop everything immediately, at any time:
--   SELECT cron.unschedule('push-send');
--   SELECT cron.unschedule('push-receipts');
--   SELECT cron.unschedule('push-question');
--
-- That is the kill switch. It stops sending without touching a single
-- device row, so nobody's preferences are lost and nothing needs
-- re-registering when it comes back on.
-- ─────────────────────────────────────────────────────────────────────────────
