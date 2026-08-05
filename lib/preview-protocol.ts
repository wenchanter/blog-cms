import type { ArticleBlock } from "@/lib/blocks";

/**
 * The postMessage contract between the editor and the live preview served by
 * personal-website at `/preview/`.
 *
 * Keep in sync with `app/blog/preview-protocol.ts` over there. `PREVIEW_VERSION`
 * exists so a stale deploy on either side is ignored rather than half-rendered:
 * both ends drop messages that do not carry the version they were built with.
 */

export const PREVIEW_PATH = "/preview/";

export const PREVIEW_VERSION = 1;

/** Namespaces our messages so unrelated postMessage traffic is skipped. */
export const PREVIEW_CHANNEL = "blog-preview";

/** Everything the article page needs that is not part of the block content. */
export type PreviewPost = {
  title: string;
  eyebrow: string;
  description: string;
  category: string;
  tags: readonly string[];
  featured: boolean;
  /** Raw ISO date; the preview formats it exactly as the build does. */
  publishedAt: string;
  content: readonly ArticleBlock[];
};

/** CMS → preview. */
export type PreviewRenderMessage = {
  channel: typeof PREVIEW_CHANNEL;
  version: number;
  type: "render";
  post: PreviewPost;
};

/** preview → CMS, once the frame is listening. */
export type PreviewReadyMessage = {
  channel: typeof PREVIEW_CHANNEL;
  version: number;
  type: "ready";
};

export type PreviewMessage = PreviewRenderMessage | PreviewReadyMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Shape check for an incoming message. This is a trust boundary — anything on
 * the page can postMessage — so callers must pair it with an origin check.
 */
export function isPreviewMessage(value: unknown): value is PreviewMessage {
  return (
    isRecord(value) &&
    value.channel === PREVIEW_CHANNEL &&
    value.version === PREVIEW_VERSION &&
    typeof value.type === "string"
  );
}

/** Normalises a configured origin, dropping any trailing slash. */
export function normalizeOrigin(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/$/, "");
}
