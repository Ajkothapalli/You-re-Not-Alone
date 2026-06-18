-- ============================================================
-- Seed confessions for the onboarding read screen.
--
-- These are shown to new users before their first write.
-- author_token uses the reserved prefix "seed:" which can never
-- match a real HMAC-SHA256 output (real tokens are 64-char hex).
-- embedding is NULL — the onboarding RPC does not filter on it.
-- ============================================================

INSERT INTO confessions (id, text, felt_count, status, author_token)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'I became so good at being okay that I stopped knowing when I wasn''t. I smile through everything. I answer "fine" before people finish asking. I don''t know how to let anyone actually see me.',
    1284,
    'live',
    'seed:onboarding:1'
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'There are things I did years ago that I still replay at 3am. Not because they were that bad, but because no one knows about them. The hiding is heavier than whatever I did. I''m so tired of carrying it alone.',
    973,
    'live',
    'seed:onboarding:2'
  )
ON CONFLICT (id) DO NOTHING;
