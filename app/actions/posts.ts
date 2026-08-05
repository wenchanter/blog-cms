"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { categorySlugExists } from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import {
  createPost,
  getPostById,
  purgePost,
  restorePost,
  setPostStatus,
  slugExists,
  softDeletePost,
  updatePost,
  type PostStatus,
} from "@/lib/posts";
import {
  validatePostForm,
  type FieldErrors,
  type PostFormValues,
} from "@/lib/validation";

/**
 * Server Actions are reachable by direct POST, not only through the UI, so
 * every one of these re-checks the session itself rather than trusting that a
 * protected page rendered the form.
 */

export type PostFormState =
  | { errors?: FieldErrors; message?: string; values?: PostFormValues }
  | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Raw form values, for error paths that bypass the validator's echo. */
function toValues(formData: FormData): PostFormValues {
  const str = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    title: str("title"),
    slug: str("slug"),
    description: str("description"),
    category: str("category"),
    eyebrow: str("eyebrow"),
    tags: str("tags"),
    contentDoc: str("contentDoc"),
    seo: str("seo"),
    status: str("status") === "published" ? "published" : "draft",
    featured: formData.get("featured") === "on",
  };
}

function refreshPostPaths(): void {
  revalidatePath("/admin/posts");
  revalidatePath("/admin");
}

export async function createPostAction(
  _prevState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  await requireUser("/admin/posts/new");

  const result = validatePostForm(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };

  // The <select> constrains the UI only — a direct POST can name anything, and
  // an unknown category would otherwise be rejected by the FK as a 500.
  if (!(await categorySlugExists(result.data.category))) {
    return { errors: { category: "分类不存在。" }, values: toValues(formData) };
  }

  if (await slugExists(result.data.slug)) {
    return { errors: { slug: "该 slug 已被占用。" }, values: toValues(formData) };
  }

  const id = await createPost(result.data);
  refreshPostPaths();

  // `redirect` throws to unwind — keep it outside try/catch.
  redirect(`/admin/posts/${id}/edit?saved=1`);
}

export async function updatePostAction(
  _prevState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  await requireUser("/admin/posts");

  const id = parseId(formData.get("id"));
  if (!id) return { message: "文章不存在。" };

  const existing = await getPostById(id);
  if (!existing) return { message: "文章不存在或已被删除。" };

  const result = validatePostForm(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };

  if (!(await categorySlugExists(result.data.category))) {
    return { errors: { category: "分类不存在。" }, values: toValues(formData) };
  }

  if (await slugExists(result.data.slug, id)) {
    return { errors: { slug: "该 slug 已被占用。" }, values: toValues(formData) };
  }

  await updatePost(id, {
    ...result.data,
    coverImageKey: existing.coverImageKey,
  });
  refreshPostPaths();
  revalidatePath(`/admin/posts/${id}/edit`);

  redirect(`/admin/posts/${id}/edit?saved=1`);
}

export async function setPostStatusAction(formData: FormData): Promise<void> {
  await requireUser("/admin/posts");

  const id = parseId(formData.get("id"));
  const raw = formData.get("status");
  const status: PostStatus = raw === "published" ? "published" : "draft";
  if (!id) return;

  await setPostStatus(id, status);
  refreshPostPaths();
  revalidatePath(`/admin/posts/${id}/edit`);
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await requireUser("/admin/posts");

  const id = parseId(formData.get("id"));
  if (!id) return;

  await softDeletePost(id);
  refreshPostPaths();
  redirect("/admin/posts");
}

export async function restorePostAction(formData: FormData): Promise<void> {
  await requireUser("/admin/posts");

  const id = parseId(formData.get("id"));
  if (!id) return;

  const restored = await restorePost(id);
  refreshPostPaths();

  // Restoring fails when the slug was reused while the post sat in the trash.
  redirect(restored ? "/admin/posts" : "/admin/posts?trash=1&error=slug");
}

export async function purgePostAction(formData: FormData): Promise<void> {
  await requireUser("/admin/posts");

  const id = parseId(formData.get("id"));
  if (!id) return;

  await purgePost(id);
  refreshPostPaths();
  redirect("/admin/posts?trash=1");
}
