import { marked, type Token, type Tokens } from "marked";
import type { ArticleBlock, InlineMark, InlineNode, RichText } from "@/lib/blocks";

/**
 * Compiles the Markdown an author writes into the block model the website
 * renders. This module is isomorphic on purpose: the editor imports it for
 * live preview and the API imports it to serve `/api/posts`, so what the
 * author sees is produced by exactly the same code that ships.
 *
 * The block model is a deliberate *subset* of Markdown. Anything it cannot
 * represent is reported as a diagnostic rather than silently dropped — a
 * post with an error-level diagnostic is refused at publish time, so content
 * can never reach the site in a mangled form.
 */

export type DiagnosticSeverity = "error" | "warning";

export type Diagnostic = {
  severity: DiagnosticSeverity;
  /** 1-based line in the Markdown source. */
  line: number;
  message: string;
};

export type CompileResult = {
  blocks: ArticleBlock[];
  diagnostics: Diagnostic[];
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
 * marked leaves HTML entities in token text (`&amp;`, `&lt;`, …). The website
 * renders these as React text nodes, so they must be decoded here or readers
 * would see the raw entity.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
}

class Compiler {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly headingIds = new Set<string>();
  /** Cumulative source offset, used to turn tokens into line numbers. */
  private offset = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  private lineAt(offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < this.source.length; i++) {
      if (this.source[i] === "\n") line++;
    }
    return line;
  }

  private report(
    severity: DiagnosticSeverity,
    message: string,
    offset = this.offset,
  ): void {
    this.diagnostics.push({ severity, line: this.lineAt(offset), message });
  }

  /* ------------------------------------------------------------- inline */

  private inline(tokens: Token[] | undefined, fallback: string): RichText {
    if (!tokens || tokens.length === 0) return decodeEntities(fallback);

    const nodes: InlineNode[] = [];
    this.walkInline(tokens, nodes, [], undefined);

    const merged = mergeAdjacent(nodes);
    // Keep the plain-string form when there is no formatting: it is the
    // shape hand-written posts already use, and it keeps payloads small.
    if (merged.length === 0) return "";
    if (merged.length === 1 && !merged[0].marks?.length && !merged[0].href) {
      return merged[0].text;
    }
    return merged;
  }

  private walkInline(
    tokens: Token[],
    out: InlineNode[],
    marks: InlineMark[],
    href: string | undefined,
  ): void {
    for (const token of tokens) {
      switch (token.type) {
        case "text":
        case "escape": {
          const inner = (token as Tokens.Text).tokens;
          if (inner && inner.length > 0) {
            this.walkInline(inner, out, marks, href);
          } else {
            this.push(out, (token as Tokens.Text).text, marks, href);
          }
          break;
        }

        case "strong":
          this.walkInline(
            (token as Tokens.Strong).tokens ?? [],
            out,
            addMark(marks, "strong"),
            href,
          );
          break;

        case "em":
          this.walkInline(
            (token as Tokens.Em).tokens ?? [],
            out,
            addMark(marks, "em"),
            href,
          );
          break;

        case "codespan":
          this.push(
            out,
            (token as Tokens.Codespan).text,
            addMark(marks, "code"),
            href,
          );
          break;

        case "link": {
          const link = token as Tokens.Link;
          this.walkInline(link.tokens ?? [], out, marks, link.href);
          break;
        }

        case "br":
          // A <p> cannot carry a line break in the block model; keep the words.
          this.report(
            "warning",
            "换行符会被合并为空格（正文块不支持硬换行），需要分段请用空行。",
          );
          this.push(out, " ", marks, href);
          break;

        case "del":
          this.report("warning", "删除线不受支持，将按普通文字渲染。");
          this.walkInline((token as Tokens.Del).tokens ?? [], out, marks, href);
          break;

        case "image":
          this.report(
            "error",
            `不支持图片：${(token as Tokens.Image).href}。正文块模型没有 image 类型，发布前请移除。`,
          );
          break;

        case "html":
          this.report(
            "error",
            `不支持行内 HTML：${(token as Tokens.HTML).raw.trim().slice(0, 40)}`,
          );
          break;

        default:
          // Unknown inline token: keep whatever text it carries rather than
          // dropping it, and flag it so the author can check.
          if ("text" in token && typeof token.text === "string") {
            this.report(
              "warning",
              `无法识别的行内语法 "${token.type}"，已按纯文字保留。`,
            );
            this.push(out, token.text, marks, href);
          } else {
            this.report("error", `无法识别的行内语法 "${token.type}"，内容会丢失。`);
          }
      }
    }
  }

  private push(
    out: InlineNode[],
    rawText: string,
    marks: InlineMark[],
    href: string | undefined,
  ): void {
    const text = decodeEntities(rawText);
    if (!text) return;
    const node: InlineNode = { type: "text", text };
    if (marks.length > 0) node.marks = [...marks];
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

  /** Blockquotes may end with an attribution line: `> — Someone`. */
  private quoteFrom(token: Tokens.Blockquote): ArticleBlock {
    const paragraphs = (token.tokens ?? []).filter(
      (child): child is Tokens.Paragraph => child.type === "paragraph",
    );

    let cite: string | undefined;
    const last = paragraphs.at(-1);
    const attribution = last?.raw.trim().match(/^(?:—|--|–)\s*(.+)$/);
    if (attribution && paragraphs.length > 1) {
      cite = attribution[1].trim();
      paragraphs.pop();
    }

    if ((token.tokens ?? []).some((child) => child.type !== "paragraph" && child.type !== "space")) {
      this.report("warning", "引用块中只有段落会被保留，其它结构会被忽略。");
    }

    const parts = paragraphs.map((p) => this.inline(p.tokens, p.text));
    const text: RichText =
      parts.length === 1
        ? parts[0]
        : parts.flatMap((part, index) =>
            typeof part === "string"
              ? [{ type: "text" as const, text: index ? ` ${part}` : part }]
              : part,
          );

    return cite ? { type: "quote", text, cite } : { type: "quote", text };
  }

  private listItems(token: Tokens.List): RichText[] {
    return token.items.map((item) => {
      const nested = (item.tokens ?? []).filter(
        (child) => child.type === "list",
      );
      if (nested.length > 0) {
        this.report(
          "error",
          "不支持嵌套列表，嵌套的条目会丢失。请改写为单层列表。",
        );
      }

      const paragraphs = (item.tokens ?? []).filter(
        (child): child is Tokens.Text | Tokens.Paragraph =>
          child.type === "text" || child.type === "paragraph",
      );

      const parts = paragraphs.map((p) =>
        this.inline(p.tokens as Token[] | undefined, p.text),
      );
      if (parts.length === 0) return "";
      if (parts.length === 1) return parts[0];
      return parts.flatMap((part, index) =>
        typeof part === "string"
          ? [{ type: "text" as const, text: index ? ` ${part}` : part }]
          : part,
      );
    });
  }

  compile(): CompileResult {
    const tokens = marked.lexer(this.source);
    const blocks: ArticleBlock[] = [];

    for (const token of tokens) {
      this.offset = this.source.indexOf(token.raw, this.offset) >= 0
        ? this.source.indexOf(token.raw, this.offset)
        : this.offset;

      switch (token.type) {
        case "space":
          break;

        case "heading": {
          const heading = token as Tokens.Heading;
          const text = this.inline(heading.tokens, heading.text);
          const plain = typeof text === "string"
            ? text
            : text.map((n) => n.text).join("");

          let level: 2 | 3 = 2;
          if (heading.depth === 1) {
            this.report(
              "warning",
              "正文里的一级标题会按二级标题渲染——文章标题请填在上方的「标题」字段。",
            );
          } else if (heading.depth >= 4) {
            this.report("warning", "只支持两级标题，四级及以下按三级渲染。");
            level = 3;
          } else if (heading.depth === 3) {
            level = 3;
          }

          blocks.push({
            type: "heading",
            id: this.headingId(plain, blocks.length),
            text,
            level,
          });
          break;
        }

        case "paragraph": {
          const paragraph = token as Tokens.Paragraph;
          const text = this.inline(paragraph.tokens, paragraph.text);
          // The first paragraph becomes the lead-in, matching the article
          // layout on the site. No special syntax for the author to remember.
          const isLead = blocks.length === 0;
          blocks.push(isLead ? { type: "lead", text } : { type: "paragraph", text });
          break;
        }

        case "list": {
          const list = token as Tokens.List;
          blocks.push({
            type: "list",
            items: this.listItems(list),
            ordered: list.ordered === true,
          });
          break;
        }

        case "blockquote":
          blocks.push(this.quoteFrom(token as Tokens.Blockquote));
          break;

        case "code": {
          const code = token as Tokens.Code;
          blocks.push({
            type: "code",
            language: (code.lang || "text").trim().split(/\s+/)[0] || "text",
            code: code.text,
          });
          break;
        }

        case "hr":
          this.report("warning", "分隔线不受支持，已忽略。");
          break;

        case "table":
          this.report(
            "error",
            "不支持表格，整个表格会丢失。可以改用列表或代码块。",
          );
          break;

        case "html":
          this.report(
            "error",
            `不支持 HTML 块：${token.raw.trim().slice(0, 40)}`,
          );
          break;

        default:
          this.report(
            "error",
            `无法识别的语法 "${token.type}"，内容会丢失。`,
          );
      }

      this.offset += token.raw.length;
    }

    return { blocks, diagnostics: this.diagnostics };
  }
}

function addMark(marks: InlineMark[], mark: InlineMark): InlineMark[] {
  return marks.includes(mark) ? marks : [...marks, mark];
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
  return (
    left.length === right.length && left.every((mark) => right.includes(mark))
  );
}

/**
 * Browsers submit textarea values with CRLF line endings, while marked
 * normalises token `raw` text to LF. Mixing the two broke the offset lookups
 * that produce diagnostic line numbers, so normalise before compiling.
 */
export function normalizeNewlines(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

export function compileMarkdown(source: string): CompileResult {
  return new Compiler(normalizeNewlines(source ?? "")).compile();
}

export function hasBlockingErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
