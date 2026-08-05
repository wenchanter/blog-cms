"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { absolutizeBlocks } from "@/lib/blocks";
import type { ArticleBlock } from "@/lib/blocks";
import type { Diagnostic } from "@/lib/tiptap";
import {
  PREVIEW_CHANNEL,
  PREVIEW_PATH,
  PREVIEW_VERSION,
  isPreviewMessage,
  normalizeOrigin,
  type PreviewPost,
  type PreviewRenderMessage,
} from "@/lib/preview-protocol";

import { ArticlePreview, DiagnosticsList } from "./article-preview";

/**
 * The live preview: an iframe onto personal-website's `/preview/`.
 *
 * The frame runs the site's real components, real stylesheet, and real fonts,
 * so what the author sees is what the build will publish — not a lookalike this
 * repo has to keep in step. Content goes in over postMessage; nothing about the
 * post is ever written to the site.
 *
 * The frame is sized to a fixed device viewport and scaled to fit, rather than
 * grown to its content. A real viewport is what makes `sm:`/`lg:` breakpoints,
 * `100dvh`, the fixed site header, and the sticky table of contents behave the
 * way they will for a reader.
 */

const SITE_ORIGIN = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_ORIGIN);

/** How long to wait for the frame's "ready" before falling back. */
const READY_TIMEOUT_MS = 6000;

const DEVICES = [
  { id: "desktop", label: "桌面", width: 1440, height: 900 },
  { id: "tablet", label: "平板", width: 834, height: 1112 },
  { id: "phone", label: "手机", width: 390, height: 844 },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

type Status = "connecting" | "live" | "unreachable" | "unconfigured";

export type PreviewInput = {
  title: string;
  eyebrow: string;
  description: string;
  category: string;
  tags: readonly string[];
  featured: boolean;
  publishedAt: string;
  blocks: readonly ArticleBlock[];
};

/** Tracks the stage's own box so the frame can be scaled to fit it. */
function useStageSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

export function SitePreview({
  input,
  diagnostics,
  onClose,
}: {
  input: PreviewInput;
  diagnostics: readonly Diagnostic[];
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const isReady = useRef(false);
  const [status, setStatus] = useState<Status>(
    SITE_ORIGIN ? "connecting" : "unconfigured",
  );
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [stageRef, stage] = useStageSize();

  const preset = DEVICES.find((entry) => entry.id === device) ?? DEVICES[0];

  const send = useCallback(() => {
    const target = frame.current?.contentWindow;

    if (!target || !isReady.current || !SITE_ORIGIN) return;

    const post: PreviewPost = {
      title: input.title,
      eyebrow: input.eyebrow,
      description: input.description,
      category: input.category,
      tags: input.tags,
      featured: input.featured,
      // An unsaved post has no publish date yet; show what publishing now
      // would produce rather than a blank line in the hero.
      publishedAt: input.publishedAt || new Date().toISOString(),
      // Image sources are stored relative to the CMS; inside the frame the
      // document origin is the site, so they have to be made absolute.
      content: absolutizeBlocks(input.blocks, window.location.origin),
    };

    const message: PreviewRenderMessage = {
      channel: PREVIEW_CHANNEL,
      version: PREVIEW_VERSION,
      type: "render",
      post,
    };

    target.postMessage(message, SITE_ORIGIN);
  }, [input]);

  useEffect(() => {
    if (!SITE_ORIGIN) return;

    function onMessage(event: MessageEvent) {
      // Origin first: any frame on the page can postMessage to us.
      if (event.origin !== SITE_ORIGIN) return;
      if (!isPreviewMessage(event.data) || event.data.type !== "ready") return;

      isReady.current = true;
      setStatus("live");
    }

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
      isReady.current = false;
    };
  }, []);

  // A cross-origin iframe reports no load errors, so a missed handshake is the
  // only signal that the site is unreachable.
  useEffect(() => {
    if (status !== "connecting") return;

    const timer = window.setTimeout(
      () => setStatus("unreachable"),
      READY_TIMEOUT_MS,
    );

    return () => window.clearTimeout(timer);
  }, [status]);

  // Push on connect and on every subsequent edit.
  useEffect(() => {
    if (status === "live") send();
  }, [status, send]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const scale =
    stage.width > 0
      ? Math.min(1, stage.width / preset.width, stage.height / preset.height)
      : 1;

  const degraded = status === "unreachable" || status === "unconfigured";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-surface"
      role="dialog"
      aria-modal="true"
      aria-label="文章预览"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <span className="text-[13px] font-semibold text-ink">预览</span>

        <span
          className={`inline-flex items-center gap-1.5 text-xs ${
            status === "live"
              ? "text-success"
              : status === "connecting"
                ? "text-muted"
                : "text-warning"
          }`}
        >
          <span
            className="size-1.5 rounded-full bg-current"
            aria-hidden="true"
          />
          {status === "live"
            ? "实时预览（与线上一致）"
            : status === "connecting"
              ? "正在连接站点…"
              : status === "unconfigured"
                ? "未配置站点地址，使用近似预览"
                : "站点未启动，使用近似预览"}
        </span>

        {!degraded && (
          <div className="flex rounded-lg border border-line p-0.5">
            {DEVICES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setDevice(entry.id)}
                aria-pressed={device === entry.id}
                className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                  device === entry.id
                    ? "bg-accent-soft font-medium text-accent-text"
                    : "text-muted hover:text-ink"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        )}

        {!degraded && scale < 1 && (
          <span className="font-mono text-xs text-subtle">
            {Math.round(scale * 100)}%
          </span>
        )}

        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-panel-muted"
        >
          关闭预览
          <span className="ml-1.5 font-mono text-subtle">Esc</span>
        </button>
      </header>

      {diagnostics.length > 0 && (
        <div className="border-b border-line bg-panel px-4 pt-3">
          <DiagnosticsList diagnostics={diagnostics} />
        </div>
      )}

      <div ref={stageRef} className="relative flex-1 overflow-auto p-4">
        {degraded ? (
          <div className="mx-auto max-w-3xl">
            <p className="mb-3 rounded-lg bg-warning-soft px-3.5 py-3 text-[13px] text-warning ring-1 ring-warning/25 ring-inset">
              这是 CMS 内置的近似预览：正文排版与线上一致，但页头、目录和页面留白是简化的。
              {status === "unreachable"
                ? " 启动 personal-website 后重新打开可看到完整效果。"
                : " 配置 NEXT_PUBLIC_SITE_ORIGIN 后重新打开可看到完整效果。"}
            </p>
            <ArticlePreview
              blocks={input.blocks}
              title={input.title}
              eyebrow={input.eyebrow}
              description={input.description}
            />
          </div>
        ) : (
          <div
            className="mx-auto"
            // The scaled frame still claims its unscaled box in layout, so the
            // wrapper carries the visual size and the frame is scaled inside it.
            style={{
              width: preset.width * scale,
              height: preset.height * scale,
            }}
          >
            <iframe
              ref={frame}
              // No sandbox: an opaque origin would make the frame's messages
              // arrive as "null" and fail the origin check below. This is our
              // own site, loaded from an origin we configured.
              src={`${SITE_ORIGIN}${PREVIEW_PATH}`}
              title="文章预览"
              className="rounded-xl border border-line bg-white shadow-raised"
              style={{
                width: preset.width,
                height: preset.height,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
