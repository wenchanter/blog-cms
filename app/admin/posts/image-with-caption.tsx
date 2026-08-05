"use client";

import { Image as TiptapImage } from "@tiptap/extension-image";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

/**
 * The image node, rendered with an editable caption.
 *
 * `alt` is the only text the block model carries for an image, and the article
 * page prints it as the visible `<figcaption>`. Leaving it to the uploader
 * meant every published image was captioned with its filename, so the author
 * writes it here instead — what you type is exactly what readers see.
 */
function ImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const src = String(node.attrs.src ?? "");
  const alt = String(node.attrs.alt ?? "");
  const width = Number(node.attrs.width) || undefined;
  const height = Number(node.attrs.height) || undefined;

  return (
    <NodeViewWrapper
      as="figure"
      className={`tiptap-image-figure${selected ? " is-selected" : ""}`}
      data-drag-handle
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={width} height={height} draggable={false} />

      {/*
       * contentEditable={false} keeps ProseMirror from treating the input as
       * document content, and stopping key propagation prevents the editor's
       * shortcuts (Enter, Backspace, Cmd+B…) from firing while typing here.
       */}
      <figcaption contentEditable={false}>
        <input
          type="text"
          value={alt}
          placeholder="添加图注（同时作为图片的替代文字）"
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          onKeyDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          aria-label="图注"
        />
      </figcaption>
    </NodeViewWrapper>
  );
}

/**
 * The stock Image extension plus the caption view. `width`/`height` are
 * declared so the intrinsic size survives a save/reload round trip.
 */
export const ImageWithCaption = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width"),
        renderHTML: (attributes) =>
          attributes.width ? { width: attributes.width } : {},
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute("height"),
        renderHTML: (attributes) =>
          attributes.height ? { height: attributes.height } : {},
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
