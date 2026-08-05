import type { Metadata } from "next";
import Link from "next/link";
import {
  createCategoryAction,
  deleteCategoryAction,
} from "@/app/actions/categories";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  IconTrash,
  LinkButton,
  PageHeader,
} from "@/app/components/ui";
import { listCategories } from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import { CategoryForm } from "./category-form";

export const metadata: Metadata = {
  title: "分类 · Blog CMS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

export default async function CategoriesPage({
  searchParams,
}: PageProps<"/admin/categories">) {
  await requireUser("/admin/categories");

  const params = await searchParams;
  const inUse = one(params.error) === "in-use";
  const updated = one(params.updated) === "1";

  const categories = await listCategories();

  return (
    <main>
      <PageHeader
        title="分类"
        count={categories.length}
        description="每篇文章必须归属于一个分类。"
      />

      {inUse && (
        <Alert tone="error">
          该分类下还有文章，无法删除。请先把这些文章移到其他分类。
        </Alert>
      )}
      {updated && <Alert tone="success">已更新。</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section>
          {categories.length === 0 ? (
            <EmptyState
              title="还没有分类"
              description="先在右侧创建一个分类，然后才能发布文章。"
            />
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-line">
                {categories.map((category) => (
                  <li
                    key={category.id}
                    className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-panel-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/categories/${category.id}/edit`}
                        className="text-sm font-medium text-ink transition-colors hover:text-accent-text"
                      >
                        {category.name}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-xs text-subtle">
                        <span className="font-mono">/{category.slug}</span>
                        {category.description && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="truncate">{category.description}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <Link
                      href={`/admin/posts?category=${encodeURIComponent(category.slug)}`}
                      className="shrink-0 text-xs text-subtle tabular-nums transition-colors hover:text-accent-text"
                    >
                      {category.postCount} 篇
                    </Link>

                    <div className="flex shrink-0 items-center gap-1.5">
                      <LinkButton
                        href={`/admin/categories/${category.id}/edit`}
                        size="sm"
                      >
                        编辑
                      </LinkButton>
                      {/* Deleting a category still in use is refused by the
                          action and, as a backstop, by the foreign key. */}
                      <form action={deleteCategoryAction}>
                        <input type="hidden" name="id" value={category.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          disabled={category.postCount > 0}
                          title={
                            category.postCount > 0
                              ? "该分类下还有文章"
                              : "删除分类"
                          }
                        >
                          <IconTrash />
                          删除
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <Card className="p-5 lg:sticky lg:top-6">
          <h2 className="mb-4 text-[13px] font-semibold tracking-wide text-subtle uppercase">
            新建分类
          </h2>
          <CategoryForm action={createCategoryAction} submitLabel="创建" />
        </Card>
      </div>
    </main>
  );
}
