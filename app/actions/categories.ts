"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  categorySlugExists,
  countPostsInCategory,
  createCategory,
  deleteCategory,
  getCategoryById,
  updateCategory,
} from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import {
  validateCategoryForm,
  type CategoryFormValues,
  type FieldErrors,
} from "@/lib/validation";

/** Like the post actions, each one re-checks the session — actions accept direct POSTs. */

export type CategoryFormState =
  | { errors?: FieldErrors; message?: string; values?: CategoryFormValues }
  | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function refresh(): void {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/posts");
  revalidatePath("/admin/posts/new");
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireUser("/admin/categories");

  const result = validateCategoryForm(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };

  if (await categorySlugExists(result.data.slug)) {
    return {
      errors: { slug: "该 slug 已被占用。" },
      values: {
        name: result.data.name,
        slug: result.data.slug,
        description: result.data.description ?? "",
      },
    };
  }

  await createCategory(result.data);
  refresh();
  return { message: "已创建。" };
}

export async function updateCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  await requireUser("/admin/categories");

  const id = parseId(formData.get("id"));
  if (!id) return { message: "分类不存在。" };

  const existing = await getCategoryById(id);
  if (!existing) return { message: "分类不存在。" };

  const result = validateCategoryForm(formData);
  if (!result.ok) return { errors: result.errors, values: result.values };

  if (await categorySlugExists(result.data.slug, id)) {
    return {
      errors: { slug: "该 slug 已被占用。" },
      values: {
        name: result.data.name,
        slug: result.data.slug,
        description: result.data.description ?? "",
      },
    };
  }

  // Changing the slug cascades to every post through the foreign key.
  await updateCategory(id, result.data);
  refresh();

  redirect("/admin/categories?updated=1");
}

export async function deleteCategoryAction(formData: FormData): Promise<void> {
  await requireUser("/admin/categories");

  const id = parseId(formData.get("id"));
  if (!id) return;

  const category = await getCategoryById(id);
  if (!category) return;

  // The FK is ON DELETE RESTRICT, so the database would reject this anyway.
  // Checking first turns a 500 into a message the author can act on.
  if ((await countPostsInCategory(category.slug)) > 0) {
    redirect("/admin/categories?error=in-use");
  }

  await deleteCategory(id);
  refresh();
  redirect("/admin/categories");
}
