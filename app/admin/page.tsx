import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  StatusBadge,
} from "@/app/components/ui";
import { requireUser } from "@/lib/dal";
import { countByStatus, listPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "概览 · Blog CMS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireUser("/admin");
  const [counts, recent] = await Promise.all([
    countByStatus(),
    listPosts({ limit: 6 }),
  ]);

  const stats = [
    {
      label: "已发布",
      value: counts.published,
      href: "/admin/posts?status=published",
      accent: true,
    },
    { label: "草稿", value: counts.draft, href: "/admin/posts?status=draft" },
    { label: "回收站", value: counts.trashed, href: "/admin/posts?trash=1" },
  ];

  return (
    <main>
      <PageHeader
        title={`欢迎回来，${user.name ?? user.email}`}
        description="这里是博客内容的整体情况。"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="group rounded-xl border border-line bg-panel p-4 shadow-panel transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-raised"
          >
            <div className="text-sm text-muted">{stat.label}</div>
            <div
              className={`mt-2 text-3xl font-semibold tabular-nums ${
                stat.accent ? "text-accent-text" : "text-ink"
              }`}
            >
              {stat.value}
            </div>
          </Link>
        ))}
      </div>

      <section className="mt-9">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">最近更新</h2>
          <Link
            href="/admin/posts"
            className="text-sm text-muted transition-colors hover:text-accent-text"
          >
            查看全部 →
          </Link>
        </div>

        {recent.posts.length === 0 ? (
          <EmptyState
            title="还没有文章"
            description="创建第一篇文章，它会出现在这里。"
            action={
              <LinkButton href="/admin/posts/new" variant="primary">
                新建文章
              </LinkButton>
            }
          />
        ) : (
          <Card className="divide-y divide-line overflow-hidden">
            {recent.posts.map((post) => (
              <Link
                key={post.id}
                href={`/admin/posts/${post.id}/edit`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-muted"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {post.title}
                </span>
                <span className="hidden shrink-0 font-mono text-xs text-subtle sm:block">
                  /{post.slug}
                </span>
                <StatusBadge status={post.status} />
              </Link>
            ))}
          </Card>
        )}
      </section>
    </main>
  );
}
