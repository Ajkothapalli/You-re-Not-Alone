-- ============================================================
-- CONFESSION CATEGORIES
-- Categories are assigned SERVER-SIDE by the classifier at submission.
-- Authors never set their own categories. Safety tags (sexuality_intimacy)
-- can never be downgraded by the author.
-- ============================================================

ALTER TABLE confessions ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';

-- GIN index for set-overlap queries (categories && reader_categories).
CREATE INDEX IF NOT EXISTS confessions_categories_gin
  ON confessions USING GIN(categories);

-- Extend confessions_public view to expose categories (read-only, no author data).
DROP VIEW IF EXISTS confessions_public CASCADE;
CREATE OR REPLACE VIEW confessions_public
  WITH (security_invoker = true) AS
  SELECT id, text, felt_count, categories, created_at
  FROM confessions
  WHERE status = 'live';
