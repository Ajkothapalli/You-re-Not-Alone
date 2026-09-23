-- ═══════════════════════════════════════════════════════════════════════════
-- Voice confessions — deletion must erase the RECORDING, not just the row
--
-- CLAUDE.md invariant 3 promises erasure. A DELETE on `confessions` removes a
-- row; the MP3 stays in the bucket. For text that distinction never mattered,
-- because the text WAS the row. For voice it is the whole point: an orphaned
-- recording is the writer's actual voice, still on disk, after they asked for
-- it to be gone.
--
-- SQL cannot delete a storage object (removing the storage.objects row does not
-- remove the underlying file). So these functions now RETURN the keys they
-- removed, and delete-account deletes the objects with service_role before it
-- reports success. The split is deliberate and the return value is the contract
-- between the two halves.
--
-- ── The anonymize path needs a different answer entirely ────────────────────
-- "Anonymize" means: keep my confessions in the pool, sever the link to me. For
-- text that works — account_id goes to NULL and nothing identifies the author.
-- For a RAW VOICE it does not work at all. The recording identifies the writer
-- to anyone who knows them, so a confession that keeps its audio has not been
-- anonymised in any sense the user would recognise; they would have chosen the
-- gentler option and got none of its protection.
--
-- So on the anonymize path the AUDIO IS DELETED and the transcript stays. The
-- transcript is the confession's content; the voice is the identifying part.
-- Removing the identifying part is what the user asked for.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Erase path ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS dsar_delete_author_data(text, uuid);

CREATE OR REPLACE FUNCTION dsar_delete_author_data(
  target_token   text,
  target_account uuid
)
RETURNS TABLE(
  deleted_confessions bigint,
  held_confessions    bigint,
  deleted_matches     bigint,
  deleted_devices     bigint,
  -- Keys whose objects the CALLER must now delete from storage. Erasure is not
  -- complete until it has.
  deleted_audio_keys  text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_confessions bigint := 0;
  v_held_confessions    bigint := 0;
  v_deleted_matches     bigint := 0;
  v_deleted_devices     bigint := 0;
  v_audio_keys          text[] := ARRAY[]::text[];
BEGIN
  -- 1. Delete seek history
  WITH del AS (
    DELETE FROM matches
    WHERE seeker_token = target_token
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_matches FROM del;

  -- 2. Hard-delete authored confessions with no active reports.
  --    RETURNING now also collects audio_key so the caller can erase the files.
  WITH del AS (
    DELETE FROM confessions
    WHERE (author_token = target_token OR account_id = target_account)
      AND NOT EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id, audio_key
  )
  SELECT count(*), coalesce(array_agg(audio_key) FILTER (WHERE audio_key IS NOT NULL), ARRAY[]::text[])
    INTO v_deleted_confessions, v_audio_keys
    FROM del;

  -- 3. Legal-hold: confessions with active reports cannot be hard-deleted.
  --    NULL out account_id + mark removed — the account link is severed.
  --
  --    Their AUDIO IS KEPT, deliberately. These rows exist because someone
  --    reported them; the recording is the evidence a human reviewer needs, and
  --    audio-only harm is precisely what the text gate cannot see. status
  --    'removed' keeps them out of the feed, so the voice is retained for
  --    review and is not playable by anyone else. This is the one place where
  --    a writer's erasure request does not reach their recording, and it is a
  --    retention decision, not an oversight.
  WITH held AS (
    UPDATE confessions
    SET    status     = 'removed',
           account_id = NULL
    WHERE  (author_token = target_token OR account_id = target_account)
      AND  status      != 'removed'
      AND  EXISTS (
        SELECT 1 FROM reports r WHERE r.confession_id = confessions.id
      )
    RETURNING id
  )
  SELECT count(*) INTO v_held_confessions FROM held;

  -- 4. Delete device records
  WITH del AS (
    DELETE FROM devices
    WHERE account_id = target_account
    RETURNING id
  )
  SELECT count(*) INTO v_deleted_devices FROM del;

  -- 5. Delete reader data
  DELETE FROM read_events        WHERE reader_account_id = target_account;
  DELETE FROM reader_preferences WHERE account_id        = target_account;

  -- 6. Delete accounts row
  DELETE FROM accounts WHERE id = target_account;

  RETURN QUERY SELECT
    v_deleted_confessions,
    v_held_confessions,
    v_deleted_matches,
    v_deleted_devices,
    v_audio_keys;
END;
$$;

REVOKE EXECUTE ON FUNCTION dsar_delete_author_data(text, uuid)
  FROM public, anon, authenticated;

-- ── 2. Anonymize path — strip the voice, keep the words ──────────────────────
DROP FUNCTION IF EXISTS dsar_anonymize_author(text, uuid);

CREATE OR REPLACE FUNCTION dsar_anonymize_author(
  target_token   text,
  target_account uuid
)
RETURNS TABLE(
  anonymized_confessions bigint,
  deleted_devices        bigint,
  deleted_audio_keys     text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anonymized  bigint := 0;
  v_devices     bigint := 0;
  v_audio_keys  text[] := ARRAY[]::text[];
BEGIN
  -- Collect the keys BEFORE nulling the columns, or they are unrecoverable.
  SELECT coalesce(array_agg(audio_key) FILTER (WHERE audio_key IS NOT NULL), ARRAY[]::text[])
    INTO v_audio_keys
    FROM confessions
   WHERE (author_token = target_token OR account_id = target_account)
     AND audio_key IS NOT NULL;

  -- Sever the account link AND drop the recording. Keeping the audio here would
  -- leave the confession as identifying as it ever was — see the header.
  WITH anon_rows AS (
    UPDATE confessions
    SET    account_id        = NULL,
           audio_key         = NULL,
           audio_duration_ms = NULL
    WHERE  (author_token = target_token OR account_id = target_account)
    RETURNING id
  )
  SELECT count(*) INTO v_anonymized FROM anon_rows;

  WITH del AS (
    DELETE FROM devices
    WHERE account_id = target_account
    RETURNING id
  )
  SELECT count(*) INTO v_devices FROM del;

  DELETE FROM read_events        WHERE reader_account_id = target_account;
  DELETE FROM reader_preferences WHERE account_id        = target_account;
  DELETE FROM accounts           WHERE id                = target_account;

  RETURN QUERY SELECT v_anonymized, v_devices, v_audio_keys;
END;
$$;

REVOKE EXECUTE ON FUNCTION dsar_anonymize_author(text, uuid)
  FROM public, anon, authenticated;

-- ── 3. Single-confession deletion ────────────────────────────────────────────
-- manage-confession handles one-at-a-time retire/delete. Same contract: it has
-- to learn the key so it can erase the object. A plain UPDATE/DELETE there would
-- silently leave the recording behind.
CREATE OR REPLACE FUNCTION take_confession_audio_key(
  p_confession_id uuid,
  p_account_id    uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  -- Ownership is re-checked here rather than trusted from the caller: this
  -- function hands back a storage path, and a path is the one thing invariant 3
  -- says must never reach the wrong person.
  SELECT audio_key INTO v_key
    FROM confessions
   WHERE id = p_confession_id
     AND account_id = p_account_id
   FOR UPDATE;

  IF v_key IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE confessions
     SET audio_key = NULL, audio_duration_ms = NULL
   WHERE id = p_confession_id;

  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION take_confession_audio_key(uuid, uuid)
  FROM public, anon, authenticated;

COMMENT ON FUNCTION take_confession_audio_key(uuid, uuid) IS
  'Clears the audio reference and returns the key so the caller can delete the '
  'object. Service-role only. The row is not considered erased until the '
  'caller has removed the file — see orphaned_confession_audio.';
