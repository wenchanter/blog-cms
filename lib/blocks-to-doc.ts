import type { ArticleBlock, InlineMark, RichText } from "@/lib/blocks";

/**
 * Blocks → TipTap document. Used only to migrate posts that were authored in
 * Markdown before the editor changed; the running application never converts in
 * this direction, so no conversion ever sits between the author and the
 * database.
 *
 * Correctness is checked by round-tripping: `compileDoc(blocksToDoc(blocks))`
 * must equal the blocks it started from, asserted per post by
 * `scripts/migrate-content-doc.mjs`.
 */

type Node = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

const MARK_TO_TIPTAP: Record<InlineMark, string> = {
  strong: "bold",
  em: "italic",
  code: "code",
  underline: "underline",
  strike: "strike",
};

function inline(value: RichText): Node[] {
  if (typeof value === "string") {
    return value ? [{ type: "text", text: value }] : [];
  }

  return value
    .filter((node) => node.text !== "")
    .map((node) => {
      const marks: Node["marks"] = (node.marks ?? []).map((mark) => ({
        type: MARK_TO_TIPTAP[mark],
      }));
      if (node.href) marks.push({ type: "link", attrs: { href: node.href } });

      const out: Node = { type: "text", text: node.text };
      if (marks.length > 0) out.marks = marks;
      return out;
    });
}

function paragraph(value: RichText): Node {
  const content = inline(value);
  return content.length > 0
    ? { type: "paragraph", content }
    : { type: "paragraph" };
}

export function blocksToDoc(blocks: readonly ArticleBlock[]): {
  type: "doc";
  content: Node[];
} {
  const content: Node[] = blocks.map((block): Node => {
    switch (block.type) {
      // `lead` is not a distinct editor node: it is simply the first paragraph,
      // and the compiler promotes it back on the way out.
      case "lead":
      case "paragraph":
        return paragraph(block.text);

      case "heading":
        return {
          type: "heading",
          attrs: { level: block.level ?? 2 },
          content: inline(block.text),
        };

      case "list":
        return {
          type: block.ordered ? "orderedList" : "bulletList",
          content: block.items.map((item) => ({
            type: "listItem",
            content: [paragraph(item)],
          })),
        };

      case "quote": {
        const paragraphs: Node[] = [paragraph(block.text)];
        // The attribution convention the compiler reads back out.
        if (block.cite) {
          paragraphs.push(paragraph(`— ${block.cite}`));
        }
        return { type: "blockquote", content: paragraphs };
      }

      case "code":
        return {
          type: "codeBlock",
          attrs: { language: block.language },
          content: block.code ? [{ type: "text", text: block.code }] : [],
        };

      case "image":
        return {
          type: "image",
          attrs: {
            src: block.src,
            alt: block.alt,
            ...(block.width ? { width: block.width } : {}),
            ...(block.height ? { height: block.height } : {}),
          },
        };
    }
  });

  return { type: "doc", content };
}
