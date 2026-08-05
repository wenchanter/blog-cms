/**
 * The article block model consumed by personal-website.
 *
 * These types are the contract between the two repos: the CMS compiles
 * Markdown into this shape and serves it from /api/posts, and the website
 * renders it without needing a Markdown parser of its own. Keep this file in
 * sync with `app/blog/types.ts` over there.
 */

/**
 * A run of text with optional marks. One node type with a `marks` array (as
 * opposed to nested nodes) keeps rendering a flat map and still expresses
 * combinations like a bolded link.
 */
export type InlineNode = {
  type: "text";
  text: string;
  marks?: InlineMark[];
  /** Present when the run is a link. */
  href?: string;
};

export type InlineMark = "strong" | "em" | "code" | "underline" | "strike";

/**
 * Plain strings stay valid so existing hand-written posts keep working; the
 * compiler emits the array form whenever a block carries inline formatting.
 */
export type RichText = string | InlineNode[];

export type ArticleBlock =
  | { type: "lead"; text: RichText }
  | { type: "heading"; id: string; text: RichText; level?: 2 | 3 }
  | { type: "paragraph"; text: RichText }
  | { type: "list"; items: readonly RichText[]; ordered?: boolean }
  | { type: "quote"; text: RichText; cite?: string }
  | { type: "code"; language: string; code: string }
  /**
   * `width`/`height` are the image's intrinsic pixel size, captured at upload
   * time so the static site can reserve space and avoid layout shift. They are
   * absent for images whose dimensions could not be determined.
   */
  | {
      type: "image";
      src: string;
      alt: string;
      width?: number;
      height?: number;
    };

/** Flattens rich text back to a plain string (search, reading time, excerpts). */
export function richTextToPlain(value: RichText): string {
  if (typeof value === "string") return value;
  return value.map((node) => node.text).join("");
}

export function blocksToPlainText(blocks: readonly ArticleBlock[]): string {
  return blocks
    .flatMap((block) => {
      if (block.type === "code") return [block.code];
      if (block.type === "image") return [block.alt];
      if (block.type === "list") return block.items.map(richTextToPlain);
      // `cite` is authored content too, so it counts towards reading time.
      if (block.type === "quote" && block.cite) {
        return [richTextToPlain(block.text), block.cite];
      }
      return [richTextToPlain(block.text)];
    })
    .join(" ");
}
