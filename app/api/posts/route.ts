import { getCloudflareContext } from "@opennextjs/cloudflare";
import { blocksToPlainText } from "@/lib/blocks";
import { getDatabase } from "@/lib/cloudflare";
import type { ArticleBlock } from "@/lib/blocks";
import { compileDocJson } from "@/lib/tiptap";
import { listPosts } from "@/lib/posts";

/**
 * Build-time feed consumed by personal-website's `scripts/sync-blog.ts`.
 *
 * Markdown is the stored source of truth; it is compiled to the block model
 * here so the website never needs a Markdown parser. The response shape
 * (`{ docs, hasNextPage, nextPage }`) is what that script's `extractPage`
 * already understands.
 */

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/** Constant-time compare so the token cannot be guessed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/**
 * Uploaded images are stored with a root-relative path so the CMS preview and
 * the editor work same-origin. The static site is served from a different
 * domain, so the feed must hand out absolute URLs or every image would 404.
 *
 * `PUBLIC_ASSET_BASE_URL` overrides the request origin for the case where the
 * bucket is fronted by a CDN or custom domain.
 */
function absolutize(
  blocks: ArticleBlock[],
  origin: string,
): ArticleBlock[] {
  return blocks.map((block) =>
    block.type === "image" && block.src.startsWith("/")
      ? { ...block, src: `${origin}${block.src}` }
      : block,
  );
}

async function readEnv(name: string): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as unknown as Record<string, unknown>)[name];
    return (typeof value === "string" ? value : undefined) ?? process.env[name];
  } catch {
    return process.env[name];
  }
}

async function readToken(): Promise<string | undefined> {
  return readEnv("CMS_API_TOKEN");
}

function unauthorized(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(request: Request): Promise<Response> {
  const expected = await readToken();

  // Refuse to serve rather than fall open if the token was never configured.
  if (!expected) {
    return Response.json(
      { error: "CMS_API_TOKEN is not configured on the server" },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!presented || !timingSafeEqual(presented, expected)) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const page = Math.max(Number(url.searchParams.get("page") ?? 1) || 1, 1);
  const assetOrigin = (
    (await readEnv("PUBLIC_ASSET_BASE_URL")) ?? url.origin
  ).replace(/\/$/, "");

  const { posts, total } = await listPosts({
    status: "published",
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  // Categories are stored by slug; the site displays a human label.
  const db = await getDatabase();
  const categoryRows = await db
    .prepare(`SELECT slug, name FROM categories`)
    .all<{ slug: string; name: string }>();
  const categoryNames = new Map(
    (categoryRows.results ?? []).map((row) => [row.slug, row.name]),
  );

  const docs = posts.map((post) => {
    const { blocks, diagnostics } = compileDocJson(post.contentDoc);

    // Publishing already refuses error-level diagnostics, so this should be
    // unreachable; surfacing it keeps a compiler regression from quietly
    // shipping a mangled article.
    const errors = diagnostics.filter((d) => d.severity === "error");
    const contentError = errors.length > 0 ? errors : undefined;

    const words = blocksToPlainText(blocks).trim().split(/\s+/).filter(Boolean);

    return {
      slug: post.slug,
      status: post.status,
      title: post.title,
      description: post.description ?? "",
      // An object so `namedValue` on the website picks the display name while
      // the slug stays available for linking.
      category: {
        slug: post.category,
        name: categoryNames.get(post.category) ?? post.category,
      },
      eyebrow: post.eyebrow ?? "",
      tags: post.tags,
      featured: post.featured,
      publishedAt: post.publishedAt ?? post.createdAt,
      updatedAt: post.updatedAt,
      readingTime: `${Math.max(1, Math.ceil(words.length / 220))} min read`,
      seo: post.seo ? safeJson(post.seo) : null,
      content: absolutize(blocks, assetOrigin),
      ...(contentError ? { contentError } : {}),
    };
  });

  const hasNextPage = page * PAGE_SIZE < total;

  return Response.json(
    {
      docs,
      total,
      page,
      hasNextPage,
      nextPage: hasNextPage ? page + 1 : null,
    },
    {
      headers: {
        // A build-time feed behind a token must never sit in a shared cache.
        "Cache-Control": "no-store",
      },
    },
  );
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
