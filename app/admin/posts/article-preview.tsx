import type { ArticleBlock, InlineNode, RichText } from "@/lib/blocks";
import type { Diagnostic } from "@/lib/tiptap";

/**
 * The offline fallback renderer.
 *
 * The normal preview is an iframe onto personal-website's `/preview/`,
 * which uses the site's own `ArticleBody` — there is nothing to drift there.
 * This copy exists only for when that site is unreachable (no network, site not
 * running locally), and it must still be trustworthy, so it is a byte-for-byte
 * copy of `app/components/blog/ArticleBody.tsx`.
 *
 * `scripts/test-renderer-parity.tsx` proves that claim against a golden file
 * generated from the real component (`npm run golden` in personal-website).
 * Do not "improve" the markup here: the test will fail, and rightly so.
 */

function CodeGlyph() {
  return (
    <svg className="size-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="m7.5 6.5-3.5 3.5 3.5 3.5m5-7 3.5 3.5-3.5 3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function Inline({ value }: { value: RichText }) {
  if (typeof value === "string") {
    return <>{value}</>;
  }

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

  if (marks.includes("em")) {
    content = <em>{content}</em>;
  }

  if (marks.includes("strike")) {
    content = <s>{content}</s>;
  }

  if (marks.includes("underline")) {
    content = <u className="underline underline-offset-2">{content}</u>;
  }

  if (marks.includes("strong")) {
    content = (
      <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
        {content}
      </strong>
    );
  }

  if (node.href) {
    const external = /^https?:\/\//.test(node.href);
    content = (
      <a
        className="text-brand underline underline-offset-2 hover:no-underline"
        href={node.href}
        {...(external
          ? { target: "_blank", rel: "noreferrer noopener" }
          : {})}
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
        <p className="text-lg leading-9 text-pretty text-zinc-700 sm:text-xl sm:leading-10 dark:text-zinc-300">
          <Inline value={block.text} />
        </p>
      );

    case "heading": {
      if (block.level === 3) {
        return (
          <h3
            className="mt-12 scroll-mt-28 text-xl leading-tight font-bold tracking-[-0.03em] text-zinc-950 sm:text-2xl dark:text-zinc-50"
            id={block.id}
          >
            <Inline value={block.text} />
          </h3>
        );
      }

      return (
        <h2
          className="mt-16 scroll-mt-28 text-2xl leading-tight font-extrabold tracking-[-0.04em] text-zinc-950 first:mt-0 sm:text-3xl dark:text-zinc-50"
          id={block.id}
        >
          <Inline value={block.text} />
        </h2>
      );
    }

    case "paragraph":
      return (
        <p className="mt-6 text-base leading-9 text-pretty text-zinc-600 sm:text-[1.0625rem] sm:leading-9 dark:text-zinc-400">
          <Inline value={block.text} />
        </p>
      );

    case "list": {
      const items = block.items.map((item, index) => (
        <li className="flex gap-3" key={index}>
          {block.ordered ? (
            <span className="mt-0.5 shrink-0 font-mono text-sm font-semibold text-brand">
              {String(index + 1).padStart(2, "0")}
            </span>
          ) : (
            <span
              className="mt-3 size-1.5 shrink-0 rounded-full bg-brand"
              aria-hidden="true"
            />
          )}
          <span>
            <Inline value={item} />
          </span>
        </li>
      ));

      return block.ordered ? (
        <ol className="mt-6 space-y-4 text-base leading-8 text-zinc-600 sm:text-[1.0625rem] dark:text-zinc-400">
          {items}
        </ol>
      ) : (
        <ul className="mt-6 space-y-4 text-base leading-8 text-zinc-600 sm:text-[1.0625rem] dark:text-zinc-400">
          {items}
        </ul>
      );
    }

    case "quote":
      return (
        <figure className="mt-10 border-l-[3px] border-brand py-1 pl-6">
          <blockquote className="text-lg leading-9 text-pretty text-zinc-600 italic sm:text-xl sm:leading-10 dark:text-zinc-300">
            <Inline value={block.text} />
          </blockquote>
          {block.cite ? (
            <figcaption className="mt-3 font-mono text-xs text-zinc-400 not-italic dark:text-zinc-500">
              {block.cite}
            </figcaption>
          ) : null}
        </figure>
      );

    case "code":
      return (
        <div className="mt-10 overflow-hidden rounded-xl border border-zinc-950/10 bg-white/70 shadow-[0_10px_30px_rgba(24,24,27,0.05)] backdrop-blur-[2px] dark:border-white/10 dark:bg-zinc-900/70">
          <div className="flex items-center gap-3 border-b border-zinc-950/8 px-4 py-3 dark:border-white/10">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-3 rounded-full bg-[#ff5f57]" />
              <span className="size-3 rounded-full bg-[#febc2e]" />
              <span className="size-3 rounded-full bg-[#28c840]" />
            </span>
            <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {block.language}
            </span>
            <span
              className="ml-auto text-zinc-300 dark:text-zinc-600"
              aria-hidden="true"
            >
              <CodeGlyph />
            </span>
          </div>
          <pre className="overflow-x-auto px-5 py-5 text-[0.8125rem] leading-7 text-zinc-700 dark:text-zinc-300">
            <code className="font-mono">{block.code}</code>
          </pre>
        </div>
      );

    case "image":
      /*
       * A plain <img> rather than next/image: the site is a static export, the
       * CMS serves these bytes with an immutable cache header, and the
       * intrinsic size travels with the block so the browser can reserve space
       * before the image loads.
       */
      return (
        <figure className="mt-10">
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

/**
 * Mirrors personal-website's default export. Kept separate from the surrounding
 * chrome below so the parity test compares exactly what the site renders.
 */
export function PreviewBody({
  content,
}: {
  content: readonly ArticleBlock[];
}) {
  return (
    <div>
      {content.map((block, index) => (
        <Block block={block} key={index} />
      ))}
    </div>
  );
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

/**
 * The fallback panel: the real body renderer wrapped in a rough stand-in for
 * the article page's header. The header is *not* covered by the parity test —
 * reproducing ArticleHero here would be exactly the duplication the iframe
 * preview was built to remove — so it stays deliberately plain and is labelled
 * as approximate wherever it is shown.
 */
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
      className="rounded-lg bg-stone-50 p-6 sm:p-8 dark:bg-zinc-950"
    >
      <header className="mb-8 border-b border-zinc-950/10 pb-8 dark:border-white/10">
        {eyebrow && (
          <p className="mb-2 font-mono text-xs tracking-wide text-brand uppercase">
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
        <PreviewBody content={blocks} />
      )}
    </div>
  );
}
