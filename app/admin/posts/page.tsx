import type { Metadata } from "next";
import Link from "next/link";
import {
  deletePostAction,
  purgePostAction,
  restorePostAction,
  setPostStatusAction,
} from "@/app/actions/posts";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  IconPlus,
  IconSparkle,
  Input,
  LinkButton,
  PageHeader,
  Select,
  StatusBadge,
} from "@/app/components/ui";
import { listCategories } from "@/lib/categories";
import { requireUser } from "@/lib/dal";
import { listPosts, type PostStatus } from "@/lib/posts";

export const metadata: Metadata = {
  title: "文章 · Blog CMS",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function one(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() || undefined;
}

export default async function PostsPage({
  searchParams,
}: PageProps<"/admin/posts">) {
  await requireUser("/admin/posts");

  const params = await searchParams;
  const trash = one(params.trash) === "1";
  const statusParam = one(params.status);
  const status: PostStatus | undefined =
    statusParam === "draft" || statusParam === "published" ? statusParam : undefined;
  const category = one(params.category);
  const tag = one(params.tag);
  const search = one(params.q);
  const page = Math.max(Number(one(params.page) ?? 1) || 1, 1);
  const restoreFailed = one(params.error) === "slug";

  const [{ posts, total }, categories] = await Promise.all([
    listPosts({
      deleted: trash,
      status,
      category,
      tag,
      search,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listCategories(),
  ]);

  const pageCount = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const categoryName = (slug: string) =>
    categories.find((item) => item.slug === slug)?.name ?? slug;
  const filtered = Boolean(search || status || category || tag);

  const pageHref = (next: number) => {
    const qs = new URLSearchParams();
    if (trash) qs.set("trash", "1");
    if (status) qs.set("status", status);
    if (category) qs.set("category", category);
    if (tag) qs.set("tag", tag);
    if (search) qs.set("q", search);
    if (next > 1) qs.set("page", String(next));
    const query = qs.toString();
    return query ? `/admin/posts?${query}` : "/admin/posts";
  };

  return (
    <main>
      <PageHeader
        title={trash ? "回收站" : "文章"}
        count={total}
        description={
          trash ? "已删除的文章可以恢复，或彻底删除。" : undefined
        }
        actions={
          <>
            <LinkButton href={trash ? "/admin/posts" : "/admin/posts?trash=1"}>
              {trash ? "← 返回文章" : "回收站"}
            </LinkButton>
            {!trash && (
              <LinkButton href="/admin/posts/new" variant="primary">
                <IconPlus />
                新建文章
              </LinkButton>
            )}
          </>
        }
      />

      {restoreFailed && (
        <Alert tone="error">恢复失败：该 slug 已被其他文章占用。</Alert>
      )}

      {!trash && (
        <Card className="mb-5 p-3">
          <form method="get" className="flex flex-wrap items-end gap-2.5">
            <div className="flex min-w-45 flex-1 flex-col gap-1.5">
              <label htmlFor="q" className="text-xs font-medium text-muted">
                搜索
              </label>
              <Input
                id="q"
                name="q"
                defaultValue={search ?? ""}
                placeholder="标题或 slug"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="status" className="text-xs font-medium text-muted">
                状态
              </label>
              <Select id="status" name="status" defaultValue={status ?? ""}>
                <option value="">全部</option>
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="category" className="text-xs font-medium text-muted">
                分类
              </label>
              <Select id="category" name="category" defaultValue={category ?? ""}>
                <option value="">全部</option>
                {categories.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            {tag && <input type="hidden" name="tag" value={tag} />}
            <Button type="submit">筛选</Button>
            {filtered && (
              <LinkButton href="/admin/posts" variant="ghost">
                清除
              </LinkButton>
            )}
          </form>
        </Card>
      )}

      {tag && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          标签筛选：
          <Badge variant="accent">{tag}</Badge>
        </p>
      )}

      {posts.length === 0 ? (
        <EmptyState
          title={trash ? "回收站是空的" : "没有符合条件的文章"}
          description={
            trash
              ? "删除的文章会先进入这里。"
              : filtered
                ? "试着放宽筛选条件。"
                : "创建第一篇文章开始吧。"
          }
          action={
            !trash && !filtered ? (
              <LinkButton href="/admin/posts/new" variant="primary">
                新建文章
              </LinkButton>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {posts.map((post) => (
              <li
                key={post.id}
                className="group flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 transition-colors hover:bg-panel-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {post.featured && (
                      <span
                        title="精选"
                        className="text-warning"
                        aria-label="精选"
                      >
                        <IconSparkle />
                      </span>
                    )}
                    {trash ? (
                      <span className="truncate text-sm font-medium text-muted">
                        {post.title}
                      </span>
                    ) : (
                      <Link
                        href={`/admin/posts/${post.id}/edit`}
                        className="truncate text-sm font-medium text-ink transition-colors hover:text-accent-text"
                      >
                        {post.title}
                      </Link>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-subtle">
                    <span className="font-mono">/{post.slug}</span>
                    <span aria-hidden>·</span>
                    <span>{categoryName(post.category)}</span>
                    {post.tags.length > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{post.tags.join(" / ")}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={post.status} />
                  <span className="hidden w-22 text-right text-xs tabular-nums text-subtle sm:block">
                    {(post.publishedAt ?? post.updatedAt).slice(0, 10)}
                  </span>
                </div>

                {/* Kept visible rather than hover-revealed: publishing and
                    deleting are the two things this page exists for. */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {trash ? (
                    <>
                      <form action={restorePostAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <Button type="submit" size="sm">
                          恢复
                        </Button>
                      </form>
                      <form action={purgePostAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <Button type="submit" size="sm" variant="danger">
                          彻底删除
                        </Button>
                      </form>
                    </>
                  ) : (
                    <>
                      <form action={setPostStatusAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={post.status === "published" ? "draft" : "published"}
                        />
                        <Button type="submit" size="sm">
                          {post.status === "published" ? "转为草稿" : "发布"}
                        </Button>
                      </form>
                      <form action={deletePostAction}>
                        <input type="hidden" name="id" value={post.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          删除
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pageCount > 1 && (
        <nav className="mt-5 flex items-center justify-between text-sm">
          {page > 1 ? (
            <LinkButton href={pageHref(page - 1)} size="sm">
              ← 上一页
            </LinkButton>
          ) : (
            <span />
          )}
          <span className="text-xs text-subtle tabular-nums">
            第 {page} / {pageCount} 页
          </span>
          {page < pageCount ? (
            <LinkButton href={pageHref(page + 1)} size="sm">
              下一页 →
            </LinkButton>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
