-- Waveform for voice confessions.
--
-- The reader never holds the audio file until they tap play, so the bars on a
-- card cannot be computed client-side. They are captured while recording and
-- stored here, which is the only way the reader sees the same shape the writer
-- saw.
--
-- WHAT THIS IS: loudness over time. WAVEFORM_BARS (48) peak values, each 0..100.
-- It is NOT pitch, not a spectrogram, and not reversible to audio — it is the
-- volume envelope, the same thing every audio app draws.
--
-- WHY IT IS SAFE TO EXPOSE, stated explicitly because invariant 3 makes voice a
-- place to be careful: the array carries no timbre and no formants, so unlike
-- the recording itself it does not let anyone recognise the speaker. It says
-- how loud someone was, not who they are. It is therefore exposed in
-- confessions_public alongside audio_duration_ms, and — like duration, unlike
-- audio_key — that is deliberate.

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS audio_waveform smallint[];

COMMENT ON COLUMN confessions.audio_waveform IS
  'Loudness envelope of the voice recording: up to 48 peaks, each 0..100. '
  'Derived, non-identifying (no timbre/formants), safe in confessions_public. '
  'NULL for typed confessions.';

-- Bound it. A client could otherwise post a megabyte of array and every feed
-- row would carry it.
ALTER TABLE confessions
  DROP CONSTRAINT IF EXISTS confessions_audio_waveform_bounds;
ALTER TABLE confessions
  ADD CONSTRAINT confessions_audio_waveform_bounds CHECK (
    audio_waveform IS NULL
    OR (
      array_length(audio_waveform, 1) BETWEEN 1 AND 64
      AND array_length(audio_waveform, 1) IS NOT NULL
    )
  );

-- ── Expose it to readers ─────────────────────────────────────────────────────
-- Rebuilt rather than altered: a view's column list cannot be extended in
-- place. Same columns as before plus audio_waveform — still no account_id, no
-- author_token, no source, no audio_key.
CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status,
         audio_duration_ms, audio_waveform
  FROM   confessions
  WHERE  status IN ('live', 'approved');

GRANT SELECT ON confessions_public TO anon, authenticated;
