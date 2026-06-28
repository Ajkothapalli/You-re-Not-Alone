-- ============================================================
-- POST-PUBLISH MODERATION
--
-- Adds a full status lifecycle to confessions:
--   live        → default after auto-gate passes (visible immediately)
--   approved    → human reviewer cleared it (stays visible, higher trust)
--   under_review→ borderline auto-flag pending human review (hidden from pool)
--   removed     → human removed (exits pool permanently)
--   crisis_held → existing (crisis path, never in pool)
--
-- Also adds:
--   • get_confession_statuses()  — author-side status check (no account link)
--   • admin_review_confession()  — operator approve/remove action
--   • operator_review_queue view — daily review surface in Supabase Studio
-- ============================================================


-- ── 1. New columns ────────────────────────────────────────────────────────────

ALTER TABLE confessions
  ADD COLUMN IF NOT EXISTS removed_reason text,
  ADD COLUMN IF NOT EXISTS reviewed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS auto_flagged   boolean NOT NULL DEFAULT false;


-- ── 2. Expand status CHECK constraint ────────────────────────────────────────
-- Postgres names the constraint after the table + column automatically.
-- We drop by the generated name; IF EXISTS is safe if it was already dropped.

ALTER TABLE confessions DROP CONSTRAINT IF EXISTS confessions_status_check;

ALTER TABLE confessions
  ADD CONSTRAINT confessions_status_check
  CHECK (status IN ('live', 'approved', 'under_review', 'crisis_held', 'removed'));


-- ── 3. Rebuild confessions_public ────────────────────────────────────────────
-- Exposes 'approved' confessions alongside 'live' and adds the status column
-- so callers can distinguish (no author_token, security_invoker unchanged).

CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at, status
  FROM   confessions
  WHERE  status IN ('live', 'approved');

-- Re-grant (CREATE OR REPLACE resets grants on some Postgres versions)
REVOKE ALL   ON confessions_public FROM anon, authenticated;
GRANT  SELECT ON confessions_public TO   anon, authenticated;


-- ── 4. Update match_confession ────────────────────────────────────────────────
-- 'approved' confessions are valid match candidates, same as 'live'.
-- under_review confessions are NOT included — they're borderline pending review.

CREATE OR REPLACE FUNCTION match_confession(
  p_embedding    extensions.vector,
  p_seeker_token text,
  p_limit        int DEFAULT 1
)
RETURNS TABLE (
  id         uuid,
  text       text,
  felt_count int,
  distance   float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    c.id,
    c.text,
    c.felt_count,
    (c.embedding <=> p_embedding)::float AS distance
  FROM confessions c
  WHERE c.status IN ('live', 'approved')
    AND c.author_token <> p_seeker_token
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION match_confession(extensions.vector, text, int)
  FROM public, anon, authenticated;


-- ── 5. Update increment_felt_count ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION increment_felt_count(p_confession_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE confessions
  SET felt_count = felt_count + 1
  WHERE id = p_confession_id
    AND status IN ('live', 'approved')
  RETURNING felt_count;
$$;

REVOKE EXECUTE ON FUNCTION increment_felt_count(uuid)
  FROM public, anon, authenticated;


-- ── 6. Update recommend_confessions ──────────────────────────────────────────
-- Identical to 20260613000003 except status filter includes 'approved'.

CREATE OR REPLACE FUNCTION recommend_confessions(
  p_reader_id       uuid,
  p_author_token    text,
  p_taste_embedding extensions.vector,
  p_categories      text[],
  p_sexual_opt_in   bool DEFAULT false,
  p_limit           int  DEFAULT 200
)
RETURNS TABLE (
  id         uuid,
  text       text,
  felt_count int,
  categories text[],
  created_at timestamptz,
  distance   float
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  WITH seen AS (
    SELECT confession_id
    FROM   read_events
    WHERE  reader_account_id = p_reader_id
  )
  SELECT
    c.id,
    c.text,
    c.felt_count,
    c.categories,
    c.created_at,
    CASE
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)::float
      ELSE NULL
    END AS distance
  FROM confessions c
  WHERE c.status IN ('live', 'approved')
    AND c.author_token <> p_author_token
    AND c.author_token NOT IN (SELECT token FROM banned_tokens)
    AND (
      array_length(p_categories, 1) IS NULL
      OR c.categories && p_categories
    )
    AND (
      p_sexual_opt_in = true
      OR NOT ('sexuality_intimacy' = ANY(c.categories))
    )
    AND c.id NOT IN (SELECT confession_id FROM seen)
  ORDER BY
    CASE
      WHEN p_taste_embedding IS NOT NULL
        THEN (c.embedding <=> p_taste_embedding)
      ELSE (1.0 / (1.0 + c.felt_count))
    END ASC
  LIMIT p_limit;
$$;

REVOKE EXECUTE ON FUNCTION recommend_confessions(uuid, text, extensions.vector, text[], bool, int)
  FROM public, anon, authenticated;


-- ── 7. get_confession_statuses ───────────────────────────────────────────────
-- Called by authenticated clients to check status of their own confession IDs.
-- Privacy invariant: client provides IDs it stored locally; no server-side
-- author→ID link exists. Returns only id/status/removed_reason — no text,
-- no author_token, no account data.

CREATE OR REPLACE FUNCTION get_confession_statuses(p_ids uuid[])
RETURNS TABLE(id uuid, status text, removed_reason text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, status, removed_reason
  FROM   confessions
  WHERE  id = ANY(p_ids);
$$;

-- Authenticated users only — anon cannot call this.
REVOKE EXECUTE ON FUNCTION get_confession_statuses(uuid[]) FROM public, anon;
GRANT  EXECUTE ON FUNCTION get_confession_statuses(uuid[]) TO   authenticated;


-- ── 8. admin_review_confession ───────────────────────────────────────────────
-- Operator action: approve or remove a confession from the review queue.
-- 'approved' → clears auto_flagged, resolves open reports, keeps confession live.
-- 'removed'  → exits pool, stores reason for author-facing notification.

CREATE OR REPLACE FUNCTION admin_review_confession(
  p_confession_id uuid,
  p_new_status    text,
  p_reason        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_status NOT IN ('approved', 'removed') THEN
    RAISE EXCEPTION 'admin_review_confession: invalid target status "%"', p_new_status;
  END IF;

  UPDATE confessions
  SET status         = p_new_status,
      removed_reason = CASE WHEN p_new_status = 'removed' THEN p_reason ELSE NULL END,
      reviewed_at    = now(),
      auto_flagged   = false
  WHERE id = p_confession_id;

  -- Resolve all open reports if approving
  IF p_new_status = 'approved' THEN
    UPDATE reports
    SET resolved = true
    WHERE confession_id = p_confession_id
      AND resolved = false;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_review_confession(uuid, text, text)
  FROM public, anon, authenticated;


-- ── 9. operator_review_queue view ────────────────────────────────────────────
-- Daily review surface. Shows:
--   • All under_review confessions (auto-flagged, pending human decision)
--   • All live/approved confessions with unresolved reports
-- Priority: reported + auto-flagged first, then reported-only, then auto-flagged.
-- Quick-action SQL snippets included for Studio use.

CREATE OR REPLACE VIEW operator_review_queue AS
SELECT
  c.id                AS confession_id,
  c.created_at,
  c.text              AS confession_text,
  c.status,
  c.auto_flagged,
  c.felt_count,
  r.id                AS report_id,
  r.reason            AS report_reason,
  r.created_at        AS reported_at,
  CASE
    WHEN r.id IS NOT NULL AND c.auto_flagged THEN 'reported + auto-flagged'
    WHEN r.id IS NOT NULL                    THEN 'reported'
    WHEN c.auto_flagged                      THEN 'auto-flagged'
    ELSE 'other'
  END                 AS priority_label,
  format(
    'SELECT admin_review_confession(''%s'', ''approved'');', c.id
  ) AS approve_sql,
  format(
    'SELECT admin_review_confession(''%s'', ''removed'', ''harmful_content'');', c.id
  ) AS remove_sql
FROM confessions c
LEFT JOIN reports r
  ON r.confession_id = c.id
 AND r.resolved = false
WHERE c.status = 'under_review'
   OR (c.status IN ('live', 'approved') AND r.id IS NOT NULL)
ORDER BY
  CASE
    WHEN r.id IS NOT NULL AND c.auto_flagged THEN 0
    WHEN r.id IS NOT NULL                    THEN 1
    WHEN c.auto_flagged                      THEN 2
    ELSE 3
  END,
  c.created_at ASC;

REVOKE ALL ON operator_review_queue FROM anon, authenticated;
