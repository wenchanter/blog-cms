import { getDatabase } from "@/lib/cloudflare";

export type PostStatus = "draft" | "published";

/** A post as the application sees it. Column names are mapped to camelCase. */
export type Post = {
  id: number;
  slug: string;
  status: PostStatus;
  title: string;
  description: string | null;
  category: string;
  eyebrow: string | null;
  tags: string[];
  featured: boolean;
  publishedAt: string | null;
  deletedAt: string | null;
  content: string;
  /** TipTap document JSON — the authored source of truth. */
  contentDoc: string;
  seo: string | null;
  coverImageKey: string | null;
  createdAt: string;
  updatedAt: string;
};

/** The writable subset — `id` and the timestamps are managed by the store. */
export type PostInput = {
  slug: string;
  status: PostStatus;
  title: string;
  description: string | null;
  category: string;
  eyebrow: string | null;
  tags: string[];
  featured: boolean;
  /** Kept for the Markdown-era archive; new posts write only `contentDoc`. */
  content: string;
  contentDoc: string;
  seo: string | null;
  coverImageKey?: string | null;
};

type PostRow = {
  id: number;
  slug: string;
  status: string;
  title: string;
  description: string | null;
  category: string;
  eyebrow: string | null;
  tags: string;
  featured: number;
  published_at: string | null;
  deleted_at: string | null;
  content: string;
  content_doc: string;
  seo: string | null;
  cover_image_key: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = `id, slug, status, title, description, category, eyebrow, tags,
                 featured, published_at, deleted_at, content, content_doc, seo,
                 cover_image_key, created_at, updated_at`;

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

function toPost(row: PostRow): Post {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t) => typeof t === "string");
  } catch {
    // A malformed value should not take down a listing page.
  }

  return {
    id: row.id,
    slug: row.slug,
    status: row.status === "published" ? "published" : "draft",
    title: row.title,
    description: row.description,
    category: row.category,
    eyebrow: row.eyebrow,
    tags,
    featured: row.featured === 1,
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    content: row.content,
    contentDoc: row.content_doc,
    seo: row.seo,
    coverImageKey: row.cover_image_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ListPostsOptions = {
  status?: PostStatus;
  category?: string;
  tag?: string;
  /** Matched against title and slug. */
  search?: string;
  featured?: boolean;
  /** `false` (default) lists live posts; `true` lists the trash. */
  deleted?: boolean;
  limit?: number;
  offset?: number;
};

export type ListPostsResult = { posts: Post[]; total: number };

/**
 * Builds the shared WHERE clause. Every value is bound, never interpolated.
 */
function buildFilters(options: ListPostsOptions): {
  where: string;
  binds: unknown[];
} {
  const clauses: string[] = [
    options.deleted ? "deleted_at IS NOT NULL" : "deleted_at IS NULL",
  ];
  const binds: unknown[] = [];

  if (options.status) {
    clauses.push("status = ?");
    binds.push(options.status);
  }
  if (options.category) {
    clauses.push("category = ?");
    binds.push(options.category);
  }
  if (options.featured !== undefined) {
    clauses.push("featured = ?");
    binds.push(options.featured ? 1 : 0);
  }
  if (options.tag) {
    clauses.push("EXISTS (SELECT 1 FROM json_each(posts.tags) WHERE value = ?)");
    binds.push(options.tag);
  }
  if (options.search) {
    // Escape LIKE wildcards so a literal % or _ cannot widen the match.
    const term = `%${options.search.replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push("(title LIKE ? ESCAPE '\\' OR slug LIKE ? ESCAPE '\\')");
    binds.push(term, term);
  }

  return { where: clauses.join(" AND "), binds };
}

export async function listPosts(
  options: ListPostsOptions = {},
): Promise<ListPostsResult> {
  const db = await getDatabase();
  const { where, binds } = buildFilters(options);
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  const offset = Math.max(options.offset ?? 0, 0);

  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT ${COLUMNS} FROM posts
          WHERE ${where}
          ORDER BY featured DESC,
                   COALESCE(published_at, updated_at) DESC,
                   id DESC
          LIMIT ? OFFSET ?`,
      )
      .bind(...binds, limit, offset)
      .all<PostRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM posts WHERE ${where}`)
      .bind(...binds)
      .first<{ total: number }>(),
  ]);

  return {
    posts: (rows.results ?? []).map(toPost),
    total: count?.total ?? 0,
  };
}

export async function getPostById(
  id: number,
  { includeDeleted = false } = {},
): Promise<Post | null> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM posts
        WHERE id = ?${includeDeleted ? "" : " AND deleted_at IS NULL"}`,
    )
    .bind(id)
    .first<PostRow>();

  return row ? toPost(row) : null;
}

/** Public lookup: only ever returns a published, non-deleted post. */
export async function getPublishedPostBySlug(slug: string): Promise<Post | null> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT ${COLUMNS} FROM posts
        WHERE slug = ? AND status = 'published' AND deleted_at IS NULL`,
    )
    .bind(slug)
    .first<PostRow>();

  return row ? toPost(row) : null;
}

/** True when another live post already owns this slug. */
export async function slugExists(
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT 1 AS hit FROM posts
        WHERE slug = ? AND deleted_at IS NULL AND id IS NOT ?
        LIMIT 1`,
    )
    .bind(slug, excludeId ?? null)
    .first<{ hit: number }>();

  return Boolean(row);
}

export async function createPost(input: PostInput): Promise<number> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `INSERT INTO posts (
         slug, status, title, description, category, eyebrow, tags,
         featured, content, content_doc, seo, cover_image_key, published_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               CASE WHEN ? = 'published' THEN ${NOW} ELSE NULL END)
       RETURNING id`,
    )
    .bind(
      input.slug,
      input.status,
      input.title,
      input.description,
      input.category,
      input.eyebrow,
      JSON.stringify(input.tags),
      input.featured ? 1 : 0,
      input.content,
      input.contentDoc,
      input.seo,
      input.coverImageKey ?? null,
      input.status,
    )
    .first<{ id: number }>();

  if (!row) throw new Error("Failed to create post");
  return row.id;
}

export async function updatePost(id: number, input: PostInput): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(
      `UPDATE posts SET
         slug = ?, status = ?, title = ?, description = ?, category = ?,
         eyebrow = ?, tags = ?, featured = ?, content = ?, content_doc = ?,
         seo = ?, cover_image_key = ?,
         -- Stamp published_at the first time it goes live; keep it thereafter.
         published_at = CASE
           WHEN ? = 'published' AND published_at IS NULL THEN ${NOW}
           ELSE published_at END,
         updated_at = ${NOW}
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(
      input.slug,
      input.status,
      input.title,
      input.description,
      input.category,
      input.eyebrow,
      JSON.stringify(input.tags),
      input.featured ? 1 : 0,
      input.content,
      input.contentDoc,
      input.seo,
      input.coverImageKey ?? null,
      input.status,
      id,
    )
    .run();
}

export async function setPostStatus(
  id: number,
  status: PostStatus,
): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(
      `UPDATE posts SET
         status = ?,
         published_at = CASE
           WHEN ? = 'published' AND published_at IS NULL THEN ${NOW}
           ELSE published_at END,
         updated_at = ${NOW}
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(status, status, id)
    .run();
}

/** Soft delete — the row stays, `deleted_at` is stamped, the slug is freed. */
export async function softDeletePost(id: number): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(
      `UPDATE posts SET deleted_at = ${NOW}, updated_at = ${NOW}
        WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(id)
    .run();
}

/**
 * Restores a soft-deleted post. Fails if its slug was taken while it sat in
 * the trash — the caller should surface that so the user can pick a new one.
 */
export async function restorePost(id: number): Promise<boolean> {
  const post = await getPostById(id, { includeDeleted: true });
  if (!post || !post.deletedAt) return false;
  if (await slugExists(post.slug, id)) return false;

  const db = await getDatabase();
  await db
    .prepare(
      `UPDATE posts SET deleted_at = NULL, updated_at = ${NOW}
        WHERE id = ? AND deleted_at IS NOT NULL`,
    )
    .bind(id)
    .run();

  return true;
}

/** Permanent removal. Only reachable from the trash view. */
export async function purgePost(id: number): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(`DELETE FROM posts WHERE id = ? AND deleted_at IS NOT NULL`)
    .bind(id)
    .run();
}

export async function countByStatus(): Promise<{
  draft: number;
  published: number;
  trashed: number;
}> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN deleted_at IS NULL AND status = 'draft' THEN 1 ELSE 0 END) AS draft,
         SUM(CASE WHEN deleted_at IS NULL AND status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS trashed
       FROM posts`,
    )
    .first<{ draft: number | null; published: number | null; trashed: number | null }>();

  return {
    draft: row?.draft ?? 0,
    published: row?.published ?? 0,
    trashed: row?.trashed ?? 0,
  };
}
