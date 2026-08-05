import type { ArticleBlock, InlineMark, InlineNode, RichText } from "@/lib/blocks";
import type { Diagnostic } from "@/lib/markdown";

/**
 * Compiles a TipTap/ProseMirror document into the block model the website
 * renders.
 *
 * The editor's schema is constrained (see `app/admin/posts/editor/`) to exactly
 * the nodes and marks that exist below, so in normal use this mapping is
 * mechanical and total — there is nothing an author can type that has no block
 * equivalent. The diagnostics exist for the abnormal cases: a doc hand-edited
 * in the database, or content that predates a schema change.
 *
 * This module is isomorphic: the editor imports it for live preview and
 * `/api/posts` imports it to serve the site, so the preview cannot drift from
 * what ships.
 */

export type { Diagnostic };

export type CompileResult = {
  blocks: ArticleBlock[];
  diagnostics: Diagnostic[];
};

type ProseMirrorMark = { type: string; attrs?: Record<string, unknown> };

type ProseMirrorNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: ProseMirrorNode[];
  marks?: ProseMirrorMark[];
  text?: string;
};

/** ProseMirror mark name → block-model mark. */
const MARK_MAP: Record<string, InlineMark> = {
  bold: "strong",
  strong: "strong",
  italic: "em",
  em: "em",
  code: "code",
  underline: "underline",
  strike: "strike",
};

/** Mirrors the slug rule in personal-website's sync-blog.ts. */
function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Upload keys embed the intrinsic size as `-<w>x<h>` before the extension, so
 * dimensions travel with the URL and no extra state has to be kept in sync.
 */
export function dimensionsFromSrc(src: string): {
  width?: number;
  height?: number;
} {
  const match = /-(\d+)x(\d+)\.[a-z0-9]+$/i.exec(src);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Compiler {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly headingIds = new Set<string>();
  /** 1-based index of the top-level node being visited, used for diagnostics. */
  private position = 1;

  private report(severity: "error" | "warning", message: string): void {
    this.diagnostics.push({ severity, line: this.position, message });
  }

  /* ------------------------------------------------------------- inline */

  private inline(nodes: ProseMirrorNode[] | undefined): RichText {
    const out: InlineNode[] = [];

    for (const node of nodes ?? []) {
      if (node.type === "hardBreak") {
        // A block-model paragraph cannot carry a line break; keep the words.
        this.report(
          "warning",
          "换行会被合并为空格（正文块不支持硬换行），需要分段请另起一段。",
        );
        this.pushRun(out, " ", [], undefined);
        continue;
      }

      if (node.type !== "text" || typeof node.text !== "string") {
        this.report(
          "error",
          `正文中出现无法转换的行内节点 "${node.type}"，内容会丢失。`,
        );
        continue;
      }

      const marks: InlineMark[] = [];
      let href: string | undefined;

      for (const mark of node.marks ?? []) {
        if (mark.type === "link") {
          const value = mark.attrs?.href;
          if (typeof value === "string" && value) href = value;
          continue;
        }

        const mapped = MARK_MAP[mark.type];
        if (mapped) {
          if (!marks.includes(mapped)) marks.push(mapped);
        } else {
          // The text survives; only the decoration is dropped.
          this.report(
            "warning",
            `不支持的行内样式 "${mark.type}"，文字保留但样式会丢失。`,
          );
        }
      }

      this.pushRun(out, node.text, marks, href);
    }

    const merged = mergeAdjacent(out);
    if (merged.length === 0) return "";
    // Keep the plain-string form when there is no formatting: smaller payloads
    // and the shape hand-written posts already use.
    if (merged.length === 1 && !merged[0].marks?.length && !merged[0].href) {
      return merged[0].text;
    }
    return merged;
  }

  private pushRun(
    out: InlineNode[],
    text: string,
    marks: InlineMark[],
    href: string | undefined,
  ): void {
    if (!text) return;
    const node: InlineNode = { type: "text", text };
    if (marks.length > 0) node.marks = marks;
    if (href) node.href = href;
    out.push(node);
  }

  /* -------------------------------------------------------------- blocks */

  private headingId(text: string, index: number): string {
    const base = slugifyHeading(text) || `heading-${index + 1}`;
    let id = base;
    let suffix = 2;
    // Duplicate ids would break the table-of-contents anchors on the site.
    while (this.headingIds.has(id)) id = `${base}-${suffix++}`;
    this.headingIds.add(id);
    return id;
  }

  /** Flattens a list item's paragraphs into a single run of rich text. */
  private listItem(item: ProseMirrorNode): RichText {
    const parts: RichText[] = [];

    for (const child of item.content ?? []) {
      if (child.type === "paragraph") {
        parts.push(this.inline(child.content));
      } else if (child.type === "bulletList" || child.type === "orderedList") {
        this.report(
          "error",
          "不支持嵌套列表，嵌套的条目会丢失。请改写为单层列表。",
        );
      } else {
        this.report(
          "error",
          `列表项中出现无法转换的内容 "${child.type}"，会丢失。`,
        );
      }
    }

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return parts.flatMap((part, index) =>
      typeof part === "string"
        ? [{ type: "text" as const, text: index ? ` ${part}` : part }]
        : part,
    );
  }

  private textOf(node: ProseMirrorNode): string {
    if (node.type === "text") return node.text ?? "";
    return (node.content ?? []).map((child) => this.textOf(child)).join("");
  }

  private block(node: ProseMirrorNode, blocks: ArticleBlock[]): void {
    switch (node.type) {
      case "paragraph": {
        const text = this.inline(node.content);
        // An empty paragraph is just spacing in the editor, not content.
        if (text === "") return;
        /*
         * Every paragraph compiles to a paragraph, including the first.
         *
         * The first one used to become a `lead`, which the article page renders
         * larger and darker. It was meant to be free — the author writes, the
         * layout happens — but it is only free when the opening happens to be a
         * sentence or two. A four-line opener rendered at lead size reads as a
         * formatting glitch, so in practice the author had to remember to keep
         * the first paragraph short. That is the interruption this editor
         * exists to avoid, so the rule is gone.
         *
         * `lead` stays in the block model and both renderers still support it;
         * older posts that carry one are unaffected.
         */
        blocks.push({ type: "paragraph", text });
        return;
      }

      case "heading": {
        const text = this.inline(node.content);
        const plain = typeof text === "string" ? text : richText(text);
        if (plain.trim() === "") return;

        const requested = Number(node.attrs?.level ?? 2);
        let level: 2 | 3 = 2;
        if (requested === 1) {
          this.report(
            "warning",
            "一级标题会按二级标题渲染——文章标题请填在上方的「标题」字段。",
          );
        } else if (requested >= 4) {
          this.report("warning", "只支持两级标题，四级及以下按三级渲染。");
          level = 3;
        } else if (requested === 3) {
          level = 3;
        }

        blocks.push({
          type: "heading",
          id: this.headingId(plain, blocks.length),
          text,
          level,
        });
        return;
      }

      case "bulletList":
      case "orderedList": {
        const items = (node.content ?? [])
          .filter((item) => item.type === "listItem")
          .map((item) => this.listItem(item));
        if (items.length === 0) return;
        blocks.push({
          type: "list",
          items,
          ordered: node.type === "orderedList",
        });
        return;
      }

      case "blockquote": {
        const paragraphs = (node.content ?? []).filter(
          (child) => child.type === "paragraph",
        );

        // A trailing `— Someone` line becomes the attribution.
        let cite: string | undefined;
        const last = paragraphs.at(-1);
        const attribution = last
          ? /^(?:—|--|–)\s*(.+)$/.exec(this.textOf(last).trim())
          : null;
        if (attribution && paragraphs.length > 1) {
          cite = attribution[1].trim();
          paragraphs.pop();
        }

        const parts = paragraphs.map((p) => this.inline(p.content));
        if (parts.length === 0) return;
        const text: RichText =
          parts.length === 1
            ? parts[0]
            : parts.flatMap((part, index) =>
                typeof part === "string"
                  ? [{ type: "text" as const, text: index ? ` ${part}` : part }]
                  : part,
              );

        blocks.push(cite ? { type: "quote", text, cite } : { type: "quote", text });
        return;
      }

      case "codeBlock": {
        const code = (node.content ?? []).map((child) => child.text ?? "").join("");
        const language = node.attrs?.language;
        blocks.push({
          type: "code",
          language:
            typeof language === "string" && language.trim() ? language.trim() : "text",
          code,
        });
        return;
      }

      case "image": {
        const src = node.attrs?.src;
        if (typeof src !== "string" || !src) {
          this.report("error", "图片缺少地址，会丢失。");
          return;
        }
        const alt = node.attrs?.alt;
        const explicitWidth = Number(node.attrs?.width);
        const explicitHeight = Number(node.attrs?.height);
        const derived = dimensionsFromSrc(src);
        const width = Number.isFinite(explicitWidth) && explicitWidth > 0
          ? explicitWidth
          : derived.width;
        const height = Number.isFinite(explicitHeight) && explicitHeight > 0
          ? explicitHeight
          : derived.height;

        const block: ArticleBlock = {
          type: "image",
          src,
          alt: typeof alt === "string" ? alt : "",
        };
        if (width && height) Object.assign(block, { width, height });
        blocks.push(block);
        return;
      }

      // An upload still in flight has no URL yet; publishing is blocked so the
      // author cannot ship a half-uploaded image.
      case "imageUpload":
        this.report("error", "有图片尚未上传完成，请等待上传结束或删除它。");
        return;

      case "horizontalRule":
        this.report("warning", "分隔线不受支持，已忽略。");
        return;

      default:
        this.report(
          "error",
          `无法转换的内容 "${node.type}"，发布后会丢失。`,
        );
    }
  }

  compile(doc: unknown): CompileResult {
    if (!isRecord(doc) || doc.type !== "doc") {
      return {
        blocks: [],
        diagnostics: [
          { severity: "error", line: 1, message: "正文数据格式不正确。" },
        ],
      };
    }

    const blocks: ArticleBlock[] = [];
    const content = Array.isArray(doc.content)
      ? (doc.content as ProseMirrorNode[])
      : [];

    content.forEach((node, index) => {
      this.position = index + 1;
      this.block(node, blocks);
    });

    return { blocks, diagnostics: this.diagnostics };
  }
}

function richText(nodes: InlineNode[]): string {
  return nodes.map((node) => node.text).join("");
}

/** Joins neighbouring runs that share marks and href, so payloads stay small. */
function mergeAdjacent(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    const previous = out.at(-1);
    if (
      previous &&
      previous.href === node.href &&
      sameMarks(previous.marks, node.marks)
    ) {
      previous.text += node.text;
    } else {
      out.push({ ...node });
    }
  }
  return out.filter((node) => node.text !== "");
}

function sameMarks(a: InlineMark[] | undefined, b: InlineMark[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((mark) => right.includes(mark));
}

export function compileDoc(doc: unknown): CompileResult {
  return new Compiler().compile(doc);
}

/** Parses stored JSON before compiling. Storage is a TEXT column. */
export function compileDocJson(json: string | null | undefined): CompileResult {
  if (!json || !json.trim()) return { blocks: [], diagnostics: [] };
  try {
    return compileDoc(JSON.parse(json));
  } catch {
    return {
      blocks: [],
      diagnostics: [
        { severity: "error", line: 1, message: "正文数据不是合法的 JSON。" },
      ],
    };
  }
}

/**
 * The canonical empty document: one empty paragraph, which is what ProseMirror
 * itself normalises to. A doc with no nodes at all renders nothing for the
 * placeholder to attach to and gives the caret nowhere to land.
 */
export const EMPTY_DOC =
  '{"type":"doc","content":[{"type":"paragraph"}]}';

/** True when the document carries no renderable content. */
export function isDocEmpty(json: string | null | undefined): boolean {
  return compileDocJson(json).blocks.length === 0;
}
