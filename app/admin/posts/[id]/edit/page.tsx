import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updatePostAction } from "@/app/actions/posts";
import { PageHeader, StatusBadge } from "@/app/components/ui";
import { listCategories } from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import { getPostById } from "@/lib/posts";
import { PostForm } from "../../post-form";

export const metadata: Metadata = {
  title: "编辑文章 · Blog CMS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
  searchParams,
}: PageProps<"/admin/posts/[id]/edit">) {
  await requireUser("/admin/posts");

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();

  const post = await getPostById(postId);
  if (!post) notFound();

  const [categories, saved] = await Promise.all([
    listCategories(),
    searchParams.then((sp) => sp.saved === "1"),
  ]);

  return (
    <main>
      <Link
        href="/admin/posts"
        className="mb-4 inline-block text-sm text-muted transition-colors hover:text-accent-text"
      >
        ← 返回文章
      </Link>
      <PageHeader
        title="编辑文章"
        description={
          <span className="flex items-center gap-2">
            <span className="font-mono text-xs">/{post.slug}</span>
            <StatusBadge status={post.status} />
          </span>
        }
      />
      {/* Remount when the post changes so the form picks up fresh defaults. */}
      <PostForm
        key={`${post.id}-${post.updatedAt}`}
        action={updatePostAction}
        post={post}
        saved={saved}
        categories={categories}
      />
    </main>
  );
}
