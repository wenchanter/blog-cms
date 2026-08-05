-- Promotes `posts.category` from free text to a managed entity.
--
-- The column keeps its TEXT shape and now holds the category *slug*, with a
-- foreign key onto `categories.slug`:
--   ON UPDATE CASCADE  — renaming a slug rewrites every post automatically.
--   ON DELETE RESTRICT — a category still in use cannot be deleted.

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Backfill one category per distinct value already in use. The existing text
-- becomes the display name; its lowercased, hyphenated form becomes the slug.
INSERT OR IGNORE INTO categories (slug, name)
SELECT DISTINCT lower(replace(trim(category), ' ', '-')), trim(category)
  FROM posts
 WHERE trim(category) <> '';

-- Posts created before `category` was required fall back to a real category
-- rather than blocking the foreign key.
INSERT OR IGNORE INTO categories (slug, name)
SELECT 'uncategorized', '未分类'
 WHERE EXISTS (SELECT 1 FROM posts WHERE trim(category) = '');

UPDATE posts
   SET category = CASE
         WHEN trim(category) = '' THEN 'uncategorized'
         ELSE lower(replace(trim(category), ' ', '-'))
       END;

-- SQLite cannot add a foreign key in place, so rebuild the table.
DROP INDEX IF EXISTS idx_posts_slug_live;
DROP INDEX IF EXISTS idx_posts_status_published_at;
DROP INDEX IF EXISTS idx_posts_category;
DROP INDEX IF EXISTS idx_posts_featured;
DROP INDEX IF EXISTS idx_posts_updated_at;

CREATE TABLE posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL
    REFERENCES categories (slug) ON UPDATE CASCADE ON DELETE RESTRICT,
  eyebrow TEXT,
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  published_at TEXT,
  deleted_at TEXT,
  content TEXT NOT NULL DEFAULT '',
  seo TEXT,
  cover_image_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO posts_new (
  id, slug, status, title, description, category, eyebrow, tags, featured,
  published_at, deleted_at, content, seo, cover_image_key, created_at, updated_at
)
SELECT
  id, slug, status, title, description, category, eyebrow, tags, featured,
  published_at, deleted_at, content, seo, cover_image_key, created_at, updated_at
FROM posts;

DROP TABLE posts;

ALTER TABLE posts_new RENAME TO posts;

CREATE UNIQUE INDEX idx_posts_slug_live
  ON posts (slug) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_status_published_at
  ON posts (status, published_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_category ON posts (category) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_featured
  ON posts (featured, published_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_updated_at ON posts (updated_at DESC);
