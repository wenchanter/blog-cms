"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PostFormState } from "@/app/actions/posts";
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "@/app/components/ui";
import type { CategoryWithCount } from "@/lib/categories";
import type { Post } from "@/lib/posts";
import { compileDocJson, EMPTY_DOC } from "@/lib/tiptap";
import { ArticlePreview, DiagnosticsList } from "./article-preview";
import { PostEditor } from "./post-editor";

/** Mirrors `slugify` in lib/validation.ts for the live preview only; the server re-derives it. */
function slugifyPreview(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

type FormValues = {
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

function seedValues(post?: Post): FormValues {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    description: post?.description ?? "",
    category: post?.category ?? "",
    eyebrow: post?.eyebrow ?? "",
    tags: post?.tags.join(", ") ?? "",
    contentDoc: post?.contentDoc || EMPTY_DOC,
    seo: post?.seo ?? "",
    status: post?.status ?? "draft",
    featured: post?.featured ?? false,
  };
}

export function PostForm({
  action,
  post,
  saved,
  categories,
}: {
  action: (state: PostFormState, formData: FormData) => Promise<PostFormState>;
  post?: Post;
  saved?: boolean;
  categories: CategoryWithCount[];
}) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    action,
    undefined,
  );

  // Every field is controlled. A form submitted through a Server Action gets
  // reset by the browser once the action resolves, and React does not reliably
  // re-apply a controlled <select> or checkbox afterwards — an author who chose
  // "已发布" would silently drop back to "草稿" on any validation error. Holding
  // the whole form in state sidesteps reset semantics entirely.
  const [values, setValues] = useState(() => seedValues(post));
  // Once a post exists its slug is a live URL, so stop auto-deriving it.
  const [slugLocked, setSlugLocked] = useState(Boolean(post));

  // Re-seed from the server's echo when a submission comes back rejected.
  // This is the "adjust state during render" pattern, not an effect.
  const [lastState, setLastState] = useState(state);
  if (state !== lastState) {
    setLastState(state);
    if (state?.values) setValues(state.values);
  }

  // A reset restores each control to its HTML *attribute* — which React never
  // sets for a <select>'s selected option or a checkbox — so these would snap
  // back even though React still believes it rendered them. Re-assert the DOM
  // after every commit; text inputs are already special-cased by React.
  const statusRef = useRef<HTMLSelectElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const featuredRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (statusRef.current && statusRef.current.value !== values.status) {
      statusRef.current.value = values.status;
    }
    if (categoryRef.current && categoryRef.current.value !== values.category) {
      categoryRef.current.value = values.category;
    }
    if (featuredRef.current && featuredRef.current.checked !== values.featured) {
      featuredRef.current.checked = values.featured;
    }
  });

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const [tab, setTab] = useState<"write" | "preview">("write");

  // Compiled with the very same function `/api/posts` uses, so what is shown
  // here is exactly what the static site will render.
  const compiled = useMemo(
    () => compileDocJson(values.contentDoc),
    [values.contentDoc],
  );

  const [uploadError, setUploadError] = useState<string | null>(null);

  const errors = state?.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {post && <input type="hidden" name="id" value={post.id} />}

      {saved && !state && <Alert tone="success">已保存。</Alert>}
      {state?.message && <Alert tone="error">{state.message}</Alert>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <Card className="flex flex-col gap-5 p-5">
          <Field label="标题" htmlFor="title" error={errors.title}>
            <Input
              id="title"
              name="title"
              required
              maxLength={200}
              placeholder="一句话说明这篇文章"
              className="text-base font-medium"
              value={values.title}
              onChange={(event) => {
                const title = event.target.value;
                setValues((current) => ({
                  ...current,
                  title,
                  slug: slugLocked ? current.slug : slugifyPreview(title),
                }));
              }}
            />
          </Field>

          <Field
            label="Slug"
            htmlFor="slug"
            error={errors.slug}
            hint={
              values.slug ? (
                <>
                  文章地址 <span className="font-mono">/{values.slug}</span>
                </>
              ) : (
                "小写字母、数字和连字符。中文标题请手动填写。"
              )
            }
          >
            <Input
              id="slug"
              name="slug"
              maxLength={160}
              className="font-mono text-[13px]"
              value={values.slug}
              onChange={(event) => {
                set("slug", event.target.value);
                setSlugLocked(true);
              }}
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="眉标" htmlFor="eyebrow" error={errors.eyebrow}>
              <Input
                id="eyebrow"
                name="eyebrow"
                maxLength={80}
                placeholder="可选"
                value={values.eyebrow}
                onChange={(event) => set("eyebrow", event.target.value)}
              />
            </Field>
            <Field
              label="标签"
              htmlFor="tags"
              error={errors.tags}
              hint="逗号分隔，最多 20 个"
            >
              <Input
                id="tags"
                name="tags"
                placeholder="next.js, cloudflare"
                value={values.tags}
                onChange={(event) => set("tags", event.target.value)}
              />
            </Field>
          </div>

          <Field label="摘要" htmlFor="description" error={errors.description}>
            <Textarea
              id="description"
              name="description"
              rows={3}
              maxLength={500}
              placeholder="列表页与分享卡片上显示的简介"
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="content" className="text-[13px] font-medium text-ink">
                正文
              </label>
              <div className="flex items-center gap-2">
                {compiled.diagnostics.length > 0 && (
                  <span
                    className={`text-xs ${
                      compiled.diagnostics.some((d) => d.severity === "error")
                        ? "text-danger"
                        : "text-warning"
                    }`}
                  >
                    {compiled.diagnostics.length} 处提示
                  </span>
                )}
                <div className="flex rounded-lg border border-line p-0.5">
                  {(["write", "preview"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTab(value)}
                      aria-pressed={tab === value}
                      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                        tab === value
                          ? "bg-accent-soft font-medium text-accent-text"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      {value === "write" ? "编辑" : "预览"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* The document travels in a hidden field so the Server Action
                receives it verbatim — the editor never round-trips it. */}
            <input type="hidden" name="contentDoc" value={values.contentDoc} />

            {/* The editor stays mounted while previewing: unmounting it would
                throw away undo history and the caret. */}
            <div className={tab === "write" ? undefined : "hidden"}>
              <PostEditor
                value={values.contentDoc}
                onChange={(json) => set("contentDoc", json)}
                onUploadError={setUploadError}
              />
            </div>

            {tab === "preview" && (
              <div className="rounded-lg border border-line bg-panel-muted p-2">
                <DiagnosticsList diagnostics={compiled.diagnostics} />
                <ArticlePreview
                  blocks={compiled.blocks}
                  title={values.title}
                  eyebrow={values.eyebrow}
                  description={values.description}
                />
              </div>
            )}

            {uploadError && (
              <p role="alert" className="text-xs font-medium text-danger">
                {uploadError}
              </p>
            )}

            {errors.content ? (
              <p role="alert" className="text-xs font-medium whitespace-pre-line text-danger">
                {errors.content}
              </p>
            ) : (
              <p className="text-xs text-subtle">
                工具栏之外的格式无法在文章页呈现，因此没有提供。
              </p>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-[13px] font-semibold tracking-wide text-subtle uppercase">
              发布
            </h2>

            <Field label="状态" htmlFor="status" error={errors.status}>
              <Select
                ref={statusRef}
                id="status"
                name="status"
                value={values.status}
                onChange={(event) => set("status", event.target.value)}
              >
                <option value="draft">草稿</option>
                <option value="published">已发布</option>
              </Select>
            </Field>

            <Field label="分类" htmlFor="category" error={errors.category}>
              <Select
                ref={categoryRef}
                id="category"
                name="category"
                value={values.category}
                onChange={(event) => set("category", event.target.value)}
              >
                <option value="">选择分类…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-panel-muted p-3 transition-colors hover:border-line-strong">
              <input
                ref={featuredRef}
                type="checkbox"
                name="featured"
                checked={values.featured}
                onChange={(event) => set("featured", event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              <span>
                <span className="block text-[13px] font-medium text-ink">
                  设为精选
                </span>
                <span className="block text-xs text-subtle">
                  精选文章排在列表最前面。
                </span>
              </span>
            </label>

            {post && (
              <dl className="flex flex-col gap-1.5 border-t border-line pt-4 text-xs text-subtle">
                {[
                  ["创建", post.createdAt.slice(0, 10)],
                  ["更新", post.updatedAt.slice(0, 10)],
                  ["发布", post.publishedAt?.slice(0, 10) ?? "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <dt>{label}</dt>
                    <dd className="text-muted tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <h2 className="text-[13px] font-semibold tracking-wide text-subtle uppercase">
              SEO
            </h2>
            <Field
              label="元数据"
              htmlFor="seo"
              error={errors.seo}
              hint='JSON 对象，例如 {"ogImage":"/og.png"}'
            >
              <Textarea
                id="seo"
                name="seo"
                rows={4}
                className="font-mono text-xs"
                placeholder="{}"
                value={values.seo}
                onChange={(event) => set("seo", event.target.value)}
              />
            </Field>
          </Card>
        </div>
      </div>

      {/* Stays reachable at the bottom of a long editor without scrolling. */}
      <div className="sticky bottom-0 -mx-1 flex items-center gap-2.5 border-t border-line bg-surface/85 px-1 py-3 backdrop-blur">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Link
          href="/admin/posts"
          className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
