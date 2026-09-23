-- ═══════════════════════════════════════════════════════════════════════════
-- Voice confessions — storage + schema
-- Owner decision 2026-09-23 (CLAUDE.md invariant 3): audio is RAW, unmodulated.
--
-- A voice is recognisable, so this migration treats the recording with the same
-- suspicion as account_id: the object key never reaches a client, the bucket is
-- private, and nothing about the path is derivable from who wrote it.
--
-- What the client is allowed to know about another person's confession:
--   * that it HAS audio, and how long it is  → audio_duration_ms, in the view
--   * nothing else                            → audio_key is REVOKED
--
-- Playback therefore cannot be done by URL construction. The client asks an
-- edge function, which looks up the key under service_role and returns a
-- short-lived signed URL. A permanent public URL would make a recognisable
-- voice hotlinkable off-platform forever, which is the specific thing the
-- consent line cannot take back.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Columns ───────────────────────────────────────────────────────────────
-- audio_key: storage object path, e.g. 'voice/<uuid>.mp3'. Random, and
--            deliberately NOT derived from account_id, author_token, or the
--            confession id — see the object-key note in create-audio-upload.
-- audio_duration_ms: needed by the feed to render a duration before fetching
--            anything, and not identifying on its own.

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS audio_key         text,
  ADD COLUMN IF NOT EXISTS audio_duration_ms integer;

-- One confession, one recording. A duplicate key would mean two rows pointing
-- at one object, and deleting either would orphan or break the other.
CREATE UNIQUE INDEX IF NOT EXISTS confessions_audio_key_uniq
  ON confessions (audio_key)
  WHERE audio_key IS NOT NULL;

-- The 3-minute cap is a product decision (owner, 2026-09-23) and is enforced
-- client-side too. Repeating it here means a client bug cannot write a row
-- claiming a 40-minute recording, and keeps the two halves from drifting.
ALTER TABLE confessions
  DROP CONSTRAINT IF EXISTS confessions_audio_duration_ck;
ALTER TABLE confessions
  ADD CONSTRAINT confessions_audio_duration_ck CHECK (
    (audio_key IS NULL AND audio_duration_ms IS NULL)
    OR (audio_key IS NOT NULL
        AND audio_duration_ms IS NOT NULL
        AND audio_duration_ms > 0
        AND audio_duration_ms <= 180000)
  );

-- ── 2. Column-level REVOKE ───────────────────────────────────────────────────
-- Same discipline as account_id / author_token / real_felt_count. The view
-- below already excludes audio_key by listing columns explicitly; this is the
-- second layer, so a future `SELECT *` somewhere cannot leak it.
REVOKE SELECT (audio_key) ON confessions FROM anon, authenticated;

-- ── 3. Rebuild confessions_public ────────────────────────────────────────────
-- Adds audio_duration_ms. Does NOT add audio_key. The column list stays
-- explicit so that adding a column to `confessions` never silently publishes
-- it (which is how account_id would have leaked).
DROP VIEW IF EXISTS confessions_public CASCADE;

CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status, audio_duration_ms
  FROM   confessions
  WHERE  status IN ('live', 'approved');

REVOKE ALL    ON confessions_public FROM anon, authenticated;
GRANT  SELECT ON confessions_public TO   anon, authenticated;

-- ── 4. Private storage bucket ────────────────────────────────────────────────
-- public = false is the load-bearing setting: with it true, every object is
-- readable by URL guess-or-share, forever, by anyone.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'confession-audio',
  'confession-audio',
  false,
  2097152,                       -- 2 MiB. A 3-min 32kbps mono MP3 is ~720 KB;
                                 -- this is headroom, not a target.
  ARRAY['audio/mpeg']            -- MP3 only. Rejects a client that tries to
                                 -- upload an uncompressed WAV or something else.
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 5. Storage RLS — nobody but service_role ─────────────────────────────────
-- No anon or authenticated policy is created, and that is deliberate: with RLS
-- enabled and no permissive policy, every direct client read/write is denied.
--
-- Clients never touch this bucket directly. Both directions go through edge
-- functions holding service_role:
--   upload   → a short-lived SIGNED UPLOAD url, issued only after the text has
--              passed the safety gate and the row exists
--   playback → a short-lived SIGNED url, issued per request
-- Signed URLs are validated by the storage service itself and do not depend on
-- these policies, so denying everything here costs nothing and closes the
-- direct path.
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "confession audio: no direct client read"  ON storage.objects;
DROP POLICY IF EXISTS "confession audio: no direct client write" ON storage.objects;

-- ── 6. Orphan detection ──────────────────────────────────────────────────────
-- Deleting a confession must delete the OBJECT, not just the row (invariant 3:
-- deletion means erasure). That happens in the edge functions, because removing
-- a storage.objects row here would not remove the underlying file.
--
-- A trigger cannot do it, so this view exists to make the failure VISIBLE:
-- anything listed here is a recording whose confession is gone — i.e. audio
-- that was promised to be erased and was not.
CREATE OR REPLACE VIEW orphaned_confession_audio AS
  SELECT o.name        AS audio_key,
         o.created_at,
         o.metadata->>'size' AS size_bytes
  FROM   storage.objects o
  WHERE  o.bucket_id = 'confession-audio'
    AND  NOT EXISTS (
           SELECT 1 FROM confessions c WHERE c.audio_key = o.name
         );

REVOKE ALL ON orphaned_confession_audio FROM anon, authenticated;

COMMENT ON VIEW orphaned_confession_audio IS
  'Recordings with no confession row. Should always be empty. A non-empty '
  'result means deletion erased the row but left the voice behind — see '
  'CLAUDE.md invariant 3.';

COMMENT ON COLUMN confessions.audio_key IS
  'Storage object path in the private confession-audio bucket. NEVER exposed '
  'to clients: revoked at column level and absent from confessions_public. '
  'Random, and not derived from account_id or author_token.';
