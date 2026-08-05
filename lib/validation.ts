import { compileDocJson } from "@/lib/tiptap";
import type { PostInput, PostStatus } from "@/lib/posts";

export type FieldErrors = Partial<Record<string, string>>;

/** The raw submitted strings, echoed back so a rejected form keeps its input. */
export type PostFormValues = {
  title: string;
  slug: string;
  description: string;
  category: string;
  eyebrow: string;
  tags: string;
  contentDoc: string;
  seo: string;
  status: string;
  featured: boolean;
};

export type ValidationResult =
  | { ok: true; data: PostInput }
  | { ok: false; errors: FieldErrors; values: PostFormValues };

const LIMITS = {
  slug: 160,
  title: 200,
  description: 500,
  category: 80,
  eyebrow: 80,
  tag: 40,
  tags: 20,
  seo: 4000,
  content: 200_000,
};

/** Lowercase, hyphen-separated, ASCII only — safe to put straight in a URL. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Derives a URL slug from a title. Non-ASCII is stripped, so CJK titles need a manual slug. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug);
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Splits the comma/newline separated tag input, de-duplicating case-insensitively. */
export function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const part of raw.split(/[,\n]/)) {
    const tag = part.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

export type CategoryFormValues = {
  name: string;
  slug: string;
  description: string;
};

export type CategoryValidationResult =
  | { ok: true; data: { slug: string; name: string; description: string | null } }
  | { ok: false; errors: FieldErrors; values: CategoryFormValues };

export function validateCategoryForm(
  formData: FormData,
): CategoryValidationResult {
  const errors: FieldErrors = {};

  const name = text(formData, "name");
  const rawSlug = text(formData, "slug");
  const slug = (rawSlug || slugify(name)).toLowerCase();
  const description = text(formData, "description");

  if (!name) errors.name = "名称不能为空。";
  else if (name.length > LIMITS.category)
    errors.name = `名称不能超过 ${LIMITS.category} 个字符。`;

  if (!slug) {
    errors.slug = "名称无法生成 slug，请手动填写。";
  } else if (slug.length > LIMITS.category) {
    errors.slug = `slug 不能超过 ${LIMITS.category} 个字符。`;
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = "slug 只能包含小写字母、数字和连字符。";
  }

  if (description.length > LIMITS.description)
    errors.description = `描述不能超过 ${LIMITS.description} 个字符。`;

  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      errors,
      values: { name, slug: rawSlug || slug, description },
    };
  }

  return {
    ok: true,
    data: { slug, name, description: description || null },
  };
}

export function validatePostForm(formData: FormData): ValidationResult {
  const errors: FieldErrors = {};

  const title = text(formData, "title");
  const rawSlug = text(formData, "slug");
  const slug = (rawSlug || slugify(title)).toLowerCase();
  const description = text(formData, "description");
  const category = text(formData, "category");
  const eyebrow = text(formData, "eyebrow");
  const tags = parseTags(text(formData, "tags"));
  const seo = text(formData, "seo");
  // The TipTap document, verbatim from the editor. Never transformed on the
  // way in: no conversion sits between the author and the database.
  const contentDoc = text(formData, "contentDoc");
  const statusRaw = text(formData, "status");
  const featured = formData.get("featured") === "on";

  if (!title) errors.title = "标题不能为空。";
  else if (title.length > LIMITS.title)
    errors.title = `标题不能超过 ${LIMITS.title} 个字符。`;

  if (!slug) {
    errors.slug = "标题无法生成 slug，请手动填写。";
  } else if (slug.length > LIMITS.slug) {
    errors.slug = `slug 不能超过 ${LIMITS.slug} 个字符。`;
  } else if (!SLUG_PATTERN.test(slug)) {
    errors.slug = "slug 只能包含小写字母、数字和连字符。";
  }

  if (!category) errors.category = "分类不能为空。";
  else if (category.length > LIMITS.category)
    errors.category = `分类不能超过 ${LIMITS.category} 个字符。`;

  if (description.length > LIMITS.description)
    errors.description = `摘要不能超过 ${LIMITS.description} 个字符。`;

  if (eyebrow.length > LIMITS.eyebrow)
    errors.eyebrow = `眉标不能超过 ${LIMITS.eyebrow} 个字符。`;

  if (tags.length > LIMITS.tags)
    errors.tags = `最多 ${LIMITS.tags} 个标签。`;
  else if (tags.some((tag) => tag.length > LIMITS.tag))
    errors.tags = `单个标签不能超过 ${LIMITS.tag} 个字符。`;

  if (contentDoc.length > LIMITS.content) errors.content = "正文过长。";

  if (seo.length > LIMITS.seo) {
    errors.seo = `SEO 内容不能超过 ${LIMITS.seo} 个字符。`;
  } else if (seo) {
    // Stored as TEXT, but it is meant to hold a JSON object of meta tags.
    try {
      const parsed = JSON.parse(seo);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        errors.seo = "SEO 需要是一个 JSON 对象。";
      }
    } catch {
      errors.seo = "SEO 不是合法的 JSON。";
    }
  }

  const status: PostStatus = statusRaw === "published" ? "published" : "draft";
  if (statusRaw && statusRaw !== "published" && statusRaw !== "draft") {
    errors.status = "状态无效。";
  }

  // The editor's schema is constrained to the block model, so this normally
  // finds nothing. It still runs because a Server Action accepts a direct POST
  // with any payload, and because a doc may predate a schema change.
  const compiled = compileDocJson(contentDoc);

  if (status === "published" && compiled.blocks.length === 0) {
    errors.content = "发布前正文不能为空。";
  }

  if (!errors.content) {
    const blocking = compiled.diagnostics.filter((d) => d.severity === "error");
    if (blocking.length > 0 && status === "published") {
      errors.content = blocking
        .map((d) => `第 ${d.line} 段：${d.message}`)
        .join("\n");
    }
  }

  // sync-blog.ts on the website treats a missing description as a hard error
  // and aborts the whole build, so catch it here instead.
  if (status === "published" && !description) {
    errors.description = "发布前摘要不能为空（静态站构建时必需）。";
  }

  if (Object.keys(errors).length > 0) {
    // Echo the slug the user actually typed, not the one derived from the title.
    return {
      ok: false,
      errors,
      values: {
        title,
        slug: rawSlug || slug,
        description,
        category,
        eyebrow,
        tags: tags.join(", "),
        contentDoc,
        seo,
        status,
        featured,
      },
    };
  }

  return {
    ok: true,
    data: {
      slug,
      status,
      title,
      description: description || null,
      category,
      eyebrow: eyebrow || null,
      tags,
      featured,
      // Markdown is no longer authored; the column keeps its historical value
      // and is written empty for new posts.
      content: "",
      contentDoc,
      seo: seo || null,
    },
  };
}
