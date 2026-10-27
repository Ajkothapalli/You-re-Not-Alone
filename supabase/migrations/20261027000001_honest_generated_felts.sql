-- Real felts only on generated stories (owner decision 2026-10-27).
--
-- push-daily-stories gave every generated story a random felt_count between
-- 30 and 300, and readers saw it as the number of people who felt it. With
-- four real users in production, those numbers were invented social proof.
-- From now on a generated story shows the felts real readers have actually
-- given it — real_felt_count — and starts at 0 when it is added.
--
-- Scoped to source <> 'user': a real person's confession is never touched.
-- Idempotent: running it twice changes nothing the second time.

UPDATE confessions
SET    felt_count = real_felt_count
WHERE  source IN ('generated', 'seed')
  AND  felt_count <> real_felt_count;
