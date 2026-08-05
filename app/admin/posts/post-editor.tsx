"use client";

import { useEffect, useMemo, useRef } from "react";
import { EditorContent, EditorContext, useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder, Selection } from "@tiptap/extensions";

import { Spacer } from "@/components/tiptap-ui-primitive/spacer";
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar";
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension";
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu";
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button";
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu";
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button";
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button";
import { LinkPopover } from "@/components/tiptap-ui/link-popover";
import { MarkButton } from "@/components/tiptap-ui/mark-button";
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button";

import "@/components/tiptap-node/blockquote-node/blockquote-node.scss";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";
import "@/components/tiptap-node/list-node/list-node.scss";
import "@/components/tiptap-node/image-node/image-node.scss";
import "@/components/tiptap-node/heading-node/heading-node.scss";
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss";
import "@/components/tiptap-templates/simple/simple-editor.scss";

import { ImageWithCaption } from "./image-with-caption";
import { EMPTY_DOC } from "@/lib/tiptap";
import { MAX_SELECT_BYTES, uploadImage } from "@/lib/upload-image";

/**
 * The article editor.
 *
 * The extension set is deliberately trimmed to exactly what `ArticleBlock` can
 * represent. That is the whole point of moving off Markdown: rather than
 * detecting unsupported constructs after the fact, the author simply cannot
 * produce them — there is no button, no shortcut and no paste rule for a table,
 * a highlight or a task list.
 *
 * Anything the Simple Editor template offers beyond that list (highlight,
 * super/subscript, text align, task lists, horizontal rule) is switched off
 * here; enabling one means adding a matching block or mark in `lib/blocks.ts`
 * *and* in personal-website's renderer.
 */



export function PostEditor({
  value,
  onChange,
  onUploadError,
}: {
  value: string;
  onChange: (json: string) => void;
  onUploadError: (message: string) => void;
}) {
  const initialContent = useMemo(() => {
    try {
      return JSON.parse(value || EMPTY_DOC);
    } catch {
      return JSON.parse(EMPTY_DOC);
    }
    // Parsed once: TipTap owns the document after mount, and re-seeding it on
    // every keystroke would fight the editor and destroy the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Held in refs so a changing callback identity never forces the editor to be
  // rebuilt — recreating it would discard the document and the undo history.
  const onChangeRef = useRef(onChange);
  const onUploadErrorRef = useRef(onUploadError);
  useEffect(() => {
    onChangeRef.current = onChange;
    onUploadErrorRef.current = onUploadError;
  }, [onChange, onUploadError]);

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "文章正文",
        class: "simple-editor",
      },
    },
    extensions: [
      StarterKit.configure({
        // Not representable as a block; the compiler would only warn about it.
        horizontalRule: false,
        heading: { levels: [2, 3] },
        link: { openOnClick: false, enableClickSelection: true },
      }),
      Selection,
      Placeholder.configure({
        placeholder: "开始写作…",
      }),
      ImageWithCaption,
      // The refs below are read when an upload finishes or fails, never during
      // render; the rule cannot distinguish the two.
      // eslint-disable-next-line react-hooks/refs
      ImageUploadNode.configure({
        accept: "image/png,image/jpeg,image/webp,image/gif,image/avif",
        // The real limit is enforced after compression, in uploadImage.
        maxSize: MAX_SELECT_BYTES,
        limit: 3,
        upload: uploadImage,
        onError: (error: Error) =>
          onUploadErrorRef.current(error.message || "图片上传失败。"),
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor }) => {
      onChangeRef.current(JSON.stringify(editor.getJSON()));
    },
  });

  // Keep the hidden form field in step with the document the editor holds,
  // including on first mount when nothing has been typed yet.
  useEffect(() => {
    if (editor) onChangeRef.current(JSON.stringify(editor.getJSON()));
  }, [editor]);

  return (
    <div className="post-editor overflow-hidden rounded-lg border border-line bg-panel">
      <EditorContext.Provider value={{ editor }}>
        <Toolbar className="!sticky !top-0 z-10 !border-b !border-line !bg-panel">
          <ToolbarGroup>
            <UndoRedoButton action="undo" />
            <UndoRedoButton action="redo" />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            {/* Only the two heading levels the block model has. */}
            <HeadingDropdownMenu modal={false} levels={[2, 3]} />
            <ListDropdownMenu modal={false} types={["bulletList", "orderedList"]} />
            <BlockquoteButton />
            <CodeBlockButton />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <MarkButton type="bold" />
            <MarkButton type="italic" />
            <MarkButton type="underline" />
            <MarkButton type="strike" />
            <MarkButton type="code" />
            <LinkPopover />
          </ToolbarGroup>
          <ToolbarSeparator />
          <ToolbarGroup>
            <ImageUploadButton text="图片" />
          </ToolbarGroup>
          <Spacer />
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="post-editor-content"
        />
      </EditorContext.Provider>
    </div>
  );
}
