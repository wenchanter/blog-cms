import type { Metadata } from "next";
import { createPostAction } from "@/app/actions/posts";
import { EmptyState, LinkButton, PageHeader } from "@/app/components/ui";
import { listCategories } from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import { PostForm } from "../post-form";

export const metadata: Metadata = {
  title: "新建文章 · Blog CMS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  await requireUser("/admin/posts/new");
  const categories = await listCategories();

  return (
    <main>
      <PageHeader title="新建文章" />
      {categories.length === 0 ? (
        <EmptyState
          title="还没有分类"
          description="文章必须归属于一个分类，请先创建分类。"
          action={
            <LinkButton href="/admin/categories" variant="primary">
              去创建分类
            </LinkButton>
          }
        />
      ) : (
        <PostForm action={createPostAction} categories={categories} />
      )}
    </main>
  );
}
