-- ============================================================
-- RECOMMENDER TABLES
--
-- Identity invariant holds:
--   reader_preferences is keyed to account_id (READER identity).
--   It must NEVER join to author_token or reveal what a user authored.
--   Reader identity and author identity are separate by design.
--
-- sexual_opt_in:
--   OFF by default. Must be explicitly set to true to receive
--   sexuality_intimacy content. Hard-filtered in the RPC — never a soft signal.
-- ============================================================


-- ── reader_preferences ───────────────────────────────────────────────────────
-- Reader taste profile. Owner-only via RLS.
-- taste_embedding: null until ≥1 positive engagement (felt/read_to_end/share).
-- Updated server-side only (recommend-confessions edge function).

CREATE TABLE reader_preferences (
  account_id      uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  categories      text[] NOT NULL DEFAULT '{}',
  sexual_opt_in   bool   NOT NULL DEFAULT false,
  taste_embedding extensions.vector(1536),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reader_preferences ENABLE ROW LEVEL SECURITY;

-- Owner can read and write their own row (categories, sexual_opt_in).
-- taste_embedding is updated by the edge function via service role.
CREATE POLICY "reader_preferences: owner read"
  ON reader_preferences FOR SELECT
  USING (auth.uid() = account_id);

CREATE POLICY "reader_preferences: owner insert"
  ON reader_preferences FOR INSERT
  WITH CHECK (auth.uid() = account_id);

CREATE POLICY "reader_preferences: owner update"
  ON reader_preferences FOR UPDATE
  USING  (auth.uid() = account_id)
  WITH CHECK (auth.uid() = account_id);

REVOKE ALL ON reader_preferences FROM anon;


-- ── read_events ───────────────────────────────────────────────────────────────
-- Engagement signals used to update taste_embedding and build item-item CF.
-- service_role only — never exposed to clients.
-- reader_account_id is the READER (consumption), never the author.

CREATE TABLE read_events (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_account_id uuid        NOT NULL REFERENCES accounts(id)    ON DELETE CASCADE,
  confession_id     uuid        NOT NULL REFERENCES confessions(id)  ON DELETE CASCADE,
  signal            text        NOT NULL CHECK (signal IN (
                                  'impression', 'read_to_end', 'felt',
                                  'share',      'skip',        'report'
                                )),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE read_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON read_events FROM anon, authenticated;


-- ── confession_neighbors ──────────────────────────────────────────────────────
-- Item-item CF table populated by the nightly recompute job.
-- service_role only.

CREATE TABLE confession_neighbors (
  confession_id uuid  NOT NULL REFERENCES confessions(id) ON DELETE CASCADE,
  neighbor_id   uuid  NOT NULL REFERENCES confessions(id) ON DELETE CASCADE,
  sim           float NOT NULL,
  PRIMARY KEY (confession_id, neighbor_id)
);

ALTER TABLE confession_neighbors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON confession_neighbors FROM anon, authenticated;


-- ── RLS verification ──────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reader_preferences', 'read_events', 'confession_neighbors'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t AND rowsecurity = true
    ) THEN
      RAISE EXCEPTION 'SECURITY: RLS is NOT enabled on table: %', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'RLS check passed for recommender tables.';
END;
$$;
