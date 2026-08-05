"use server";

import { readEnv } from "@/lib/cloudflare";
import { requireUser } from "@/lib/dal";

/**
 * Triggers a rebuild of the static site.
 *
 * The blog is a static export: articles are baked into HTML at build time, so
 * publishing in the CMS does not change what readers see until the site is
 * rebuilt. This posts to a Cloudflare Pages deploy hook to start that build.
 *
 * It is deliberately manual. Firing on every save would spend build quota on
 * work in progress (the free plan allows 500 builds a month and runs one at a
 * time, so a burst just queues), and the author is the one who knows when a
 * batch of edits is actually ready to go out.
 */

export type DeployState = {
  status: "success" | "error";
  message: string;
  /** ISO timestamp of the attempt, rendered in the local timezone. */
  at: string;
} | null;

export async function triggerSiteBuild(): Promise<DeployState> {
  await requireUser("/admin");

  const at = new Date().toISOString();
  const hook = await readEnv("PAGES_DEPLOY_HOOK");

  if (!hook) {
    return {
      status: "error",
      message:
        "未配置 PAGES_DEPLOY_HOOK。在 Pages 项目的 Settings → Builds 里创建 Deploy hook，再执行 npx wrangler secret put PAGES_DEPLOY_HOOK。",
      at,
    };
  }

  // The hook URL is an unauthenticated secret; refuse anything that is not the
  // Cloudflare endpoint so a misconfigured value cannot turn this button into
  // an open request forwarder.
  let url: URL;
  try {
    url = new URL(hook);
  } catch {
    return { status: "error", message: "PAGES_DEPLOY_HOOK 不是合法的 URL。", at };
  }
  if (url.protocol !== "https:" || url.hostname !== "api.cloudflare.com") {
    return {
      status: "error",
      message: "PAGES_DEPLOY_HOOK 必须是 https://api.cloudflare.com/... 的部署钩子地址。",
      at,
    };
  }

  try {
    const response = await fetch(url, { method: "POST" });

    if (!response.ok) {
      return {
        status: "error",
        message: `Cloudflare 返回 ${response.status}。钩子可能已被删除，请重新创建并更新 secret。`,
        at,
      };
    }

    return {
      status: "success",
      message: "已触发构建，通常 1–2 分钟后线上生效。",
      at,
    };
  } catch {
    // Never surface the URL itself in an error — it is the credential.
    return { status: "error", message: "请求部署钩子失败，请稍后重试。", at };
  }
}
