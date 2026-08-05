-- Reshapes `posts` to the CMS article schema. SQLite cannot add CHECK
-- constraints or repartition indexes in place, so the table is rebuilt and the
-- existing rows are carried over (`excerpt` becomes `description`).

DROP INDEX IF EXISTS idx_posts_status_published_at;

CREATE TABLE posts_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT '',
  eyebrow TEXT,
  -- SQLite has no array type; tags are a JSON array of strings, queried with
  -- json_each(). The CHECK keeps malformed JSON out of the column.
  tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  -- NULL until the post is first published.
  published_at TEXT,
  -- Soft delete: NULL means live. Every read filters on this.
  deleted_at TEXT,
  content TEXT NOT NULL DEFAULT '',
  seo TEXT,
  cover_image_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO posts_new (
  id, slug, status, title, description, content, cover_image_key,
  published_at, created_at, updated_at
)
SELECT
  id, slug, status, title, excerpt, content, cover_image_key,
  published_at, created_at, updated_at
FROM posts;

DROP TABLE posts;

ALTER TABLE posts_new RENAME TO posts;

-- Slugs must be unique among live posts only, so a soft-deleted post does not
-- permanently reserve its slug.
CREATE UNIQUE INDEX idx_posts_slug_live
  ON posts (slug) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_status_published_at
  ON posts (status, published_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_category ON posts (category) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_featured
  ON posts (featured, published_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX idx_posts_updated_at ON posts (updated_at DESC);
