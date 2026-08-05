import { getDatabase } from "@/lib/cloudflare";

export type Category = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A category plus how many live posts reference it. */
export type CategoryWithCount = Category & { postCount: number };

export type CategoryInput = {
  slug: string;
  name: string;
  description: string | null;
};

type CategoryRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCategories(): Promise<CategoryWithCount[]> {
  const db = await getDatabase();
  const rows = await db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM posts p
                WHERE p.category = c.slug AND p.deleted_at IS NULL) AS post_count
         FROM categories c
        ORDER BY c.name`,
    )
    .all<CategoryRow & { post_count: number }>();

  return (rows.results ?? []).map((row) => ({
    ...toCategory(row),
    postCount: row.post_count,
  }));
}

export async function getCategoryById(id: number): Promise<Category | null> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT id, slug, name, description, created_at, updated_at
         FROM categories WHERE id = ?`,
    )
    .bind(id)
    .first<CategoryRow>();

  return row ? toCategory(row) : null;
}

/** True when another category already owns this slug. */
export async function categorySlugExists(
  slug: string,
  excludeId?: number,
): Promise<boolean> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `SELECT 1 AS hit FROM categories
        WHERE slug = ? AND id IS NOT ? LIMIT 1`,
    )
    .bind(slug, excludeId ?? null)
    .first<{ hit: number }>();

  return Boolean(row);
}

export async function createCategory(input: CategoryInput): Promise<number> {
  const db = await getDatabase();
  const row = await db
    .prepare(
      `INSERT INTO categories (slug, name, description)
       VALUES (?, ?, ?) RETURNING id`,
    )
    .bind(input.slug, input.name, input.description)
    .first<{ id: number }>();

  if (!row) throw new Error("Failed to create category");
  return row.id;
}

/**
 * Renaming the slug rewrites every post that references it, via the
 * ON UPDATE CASCADE on `posts.category`.
 */
export async function updateCategory(
  id: number,
  input: CategoryInput,
): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(
      `UPDATE categories
          SET slug = ?, name = ?, description = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        WHERE id = ?`,
    )
    .bind(input.slug, input.name, input.description, id)
    .run();
}

/** Live and trashed posts both count — a restore must not dangle. */
export async function countPostsInCategory(slug: string): Promise<number> {
  const db = await getDatabase();
  const row = await db
    .prepare(`SELECT COUNT(*) AS total FROM posts WHERE category = ?`)
    .bind(slug)
    .first<{ total: number }>();

  return row?.total ?? 0;
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDatabase();
  await db.prepare(`DELETE FROM categories WHERE id = ?`).bind(id).run();
}
