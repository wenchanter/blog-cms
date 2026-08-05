"use client";

import type { ArticleBlock, InlineNode, RichText } from "@/lib/blocks";
import type { Diagnostic } from "@/lib/tiptap";

/**
 * Renders compiled blocks the way personal-website's ArticleBody does, so the
 * author sees the real published layout rather than a generic Markdown render.
 * The markup mirrors that component; when the site's article styling changes,
 * update this alongside it.
 */

function Inline({ value }: { value: RichText }) {
  if (typeof value === "string") return <>{value}</>;
  return (
    <>
      {value.map((node, index) => (
        <InlineRun key={index} node={node} />
      ))}
    </>
  );
}

function InlineRun({ node }: { node: InlineNode }) {
  let content: React.ReactNode = node.text;
  const marks = node.marks ?? [];

  if (marks.includes("code")) {
    content = (
      <code className="rounded bg-zinc-950/5 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">
        {content}
      </code>
    );
  }
  if (marks.includes("em")) content = <em>{content}</em>;
  if (marks.includes("strike")) content = <s>{content}</s>;
  if (marks.includes("underline")) {
    content = <u className="underline underline-offset-2">{content}</u>;
  }
  if (marks.includes("strong")) {
    content = <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{content}</strong>;
  }
  if (node.href) {
    content = (
      <a
        href={node.href}
        className="text-accent-text underline underline-offset-2"
        target="_blank"
        rel="noreferrer"
      >
        {content}
      </a>
    );
  }

  return <>{content}</>;
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case "lead":
      return (
        <p className="text-lg leading-9 text-pretty text-zinc-700 dark:text-zinc-300">
          <Inline value={block.text} />
        </p>
      );

    case "heading":
      return block.level === 3 ? (
        <h3 className="mt-10 text-xl leading-tight font-bold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
          <Inline value={block.text} />
        </h3>
      ) : (
        <h2 className="mt-12 text-2xl leading-tight font-extrabold tracking-[-0.04em] text-zinc-950 first:mt-0 dark:text-zinc-50">
          <Inline value={block.text} />
        </h2>
      );

    case "paragraph":
      return (
        <p className="mt-5 text-base leading-9 text-pretty text-zinc-600 dark:text-zinc-400">
          <Inline value={block.text} />
        </p>
      );

    case "list": {
      const items = block.items.map((item, index) => (
        <li className="flex gap-3" key={index}>
          {block.ordered ? (
            <span className="mt-0.5 shrink-0 font-mono text-sm font-semibold text-accent">
              {String(index + 1).padStart(2, "0")}
            </span>
          ) : (
            <span
              className="mt-3 size-1.5 shrink-0 rounded-full bg-accent"
              aria-hidden
            />
          )}
          <span>
            <Inline value={item} />
          </span>
        </li>
      ));

      return block.ordered ? (
        <ol className="mt-5 space-y-3 text-base leading-8 text-zinc-600 dark:text-zinc-400">
          {items}
        </ol>
      ) : (
        <ul className="mt-5 space-y-3 text-base leading-8 text-zinc-600 dark:text-zinc-400">
          {items}
        </ul>
      );
    }

    case "quote":
      return (
        <figure className="mt-8 border-l-[3px] border-accent py-1 pl-6">
          <blockquote className="text-lg leading-9 text-pretty text-zinc-600 italic dark:text-zinc-300">
            <Inline value={block.text} />
          </blockquote>
          {block.cite && (
            <figcaption className="mt-3 font-mono text-xs text-zinc-400 not-italic dark:text-zinc-500">
              {block.cite}
            </figcaption>
          )}
        </figure>
      );

    case "code":
      return (
        <div className="mt-8 overflow-hidden rounded-xl border border-zinc-950/10 bg-white/70 dark:border-white/10 dark:bg-zinc-900/70">
          <div className="flex items-center gap-3 border-b border-zinc-950/8 px-4 py-2.5 dark:border-white/10">
            <span className="flex gap-1.5" aria-hidden>
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </span>
            <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {block.language}
            </span>
          </div>
          <pre className="overflow-x-auto px-5 py-4 text-[0.8125rem] leading-7 text-zinc-700 dark:text-zinc-300">
            <code className="font-mono">{block.code}</code>
          </pre>
        </div>
      );

    case "image":
      return (
        <figure className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-xl border border-zinc-950/10 dark:border-white/10"
          />
          {block.alt ? (
            <figcaption className="mt-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {block.alt}
            </figcaption>
          ) : null}
        </figure>
      );

    default:
      return null;
  }
}

export function DiagnosticsList({
  diagnostics,
}: {
  diagnostics: readonly Diagnostic[];
}) {
  if (diagnostics.length === 0) return null;

  const errors = diagnostics.filter((d) => d.severity === "error");

  return (
    <div
      className={`mb-4 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset ${
        errors.length > 0
          ? "bg-danger-soft text-danger ring-danger/25"
          : "bg-warning-soft text-warning ring-warning/25"
      }`}
      role={errors.length > 0 ? "alert" : undefined}
    >
      <p className="mb-1.5 font-medium">
        {errors.length > 0
          ? `${errors.length} 处内容无法在文章页呈现，发布前必须修复`
          : `${diagnostics.length} 处提示`}
      </p>
      <ul className="flex flex-col gap-1">
        {diagnostics.map((diagnostic, index) => (
          <li key={index} className="text-[13px] leading-relaxed">
            <span className="font-mono opacity-70">第 {diagnostic.line} 段</span>
            　{diagnostic.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ArticlePreview({
  blocks,
  title,
  eyebrow,
  description,
}: {
  blocks: readonly ArticleBlock[];
  title: string;
  eyebrow: string;
  description: string;
}) {
  return (
    <div
      data-article-preview
      className="rounded-lg bg-white p-6 sm:p-8 dark:bg-zinc-950"
    >
      <header className="mb-8 border-b border-zinc-950/10 pb-8 dark:border-white/10">
        {eyebrow && (
          <p className="mb-2 font-mono text-xs tracking-wide text-accent uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.04em] text-zinc-950 dark:text-zinc-50">
          {title || "未命名文章"}
        </h1>
        {description && (
          <p className="mt-3 text-base leading-8 text-zinc-500 dark:text-zinc-400">
            {description}
          </p>
        )}
      </header>

      {blocks.length === 0 ? (
        <p className="text-sm text-zinc-400">正文为空。</p>
      ) : (
        blocks.map((block, index) => <Block key={index} block={block} />)
      )}
    </div>
  );
}
