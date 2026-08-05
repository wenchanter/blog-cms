import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCategoryAction } from "@/app/actions/categories";
import { Card, PageHeader } from "@/app/components/ui";
import { countPostsInCategory, getCategoryById } from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import { CategoryForm } from "../../category-form";

export const metadata: Metadata = {
  title: "编辑分类 · Blog CMS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
}: PageProps<"/admin/categories/[id]/edit">) {
  await requireUser("/admin/categories");

  const { id } = await params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) notFound();

  const category = await getCategoryById(categoryId);
  if (!category) notFound();

  const postCount = await countPostsInCategory(category.slug);

  return (
    <main className="max-w-xl">
      <Link
        href="/admin/categories"
        className="mb-4 inline-block text-sm text-muted transition-colors hover:text-accent-text"
      >
        ← 返回分类
      </Link>
      <PageHeader
        title="编辑分类"
        description={`当前有 ${postCount} 篇文章使用该分类。`}
      />
      <Card className="p-5">
        <CategoryForm
          key={`${category.id}-${category.updatedAt}`}
          action={updateCategoryAction}
          category={category}
          submitLabel="保存"
        />
      </Card>
    </main>
  );
}
