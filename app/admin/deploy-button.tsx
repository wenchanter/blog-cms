"use client";

import { useActionState } from "react";

import { triggerSiteBuild, type DeployState } from "@/app/actions/deploy";
import { Button } from "@/app/components/ui";

/**
 * Manual "publish to the live site" control.
 *
 * The CMS and the blog are separate deployments: saving here updates the
 * database, but readers see a static build. Without this the only way to ship a
 * post is the Cloudflare dashboard, and it is easy to forget the step entirely
 * and wonder why the article never appeared.
 */
export function DeployButton() {
  const [state, formAction, pending] = useActionState<DeployState, FormData>(
    () => triggerSiteBuild(),
    null,
  );

  return (
    <div className="border-t border-line pt-4">
      <form action={formAction}>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="w-full justify-start"
          disabled={pending}
        >
          <svg
            viewBox="0 0 24 24"
            className={`size-4 ${pending ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {pending ? (
              <path d="M21 12a9 9 0 11-6.2-8.6" />
            ) : (
              <>
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </>
            )}
          </svg>
          {pending ? "正在触发…" : "发布到线上"}
        </Button>
      </form>

      {state && (
        <p
          role="status"
          className={`mt-2 px-1 text-xs leading-relaxed ${
            state.status === "success" ? "text-success" : "text-danger"
          }`}
        >
          {state.message}
        </p>
      )}

      <p className="mt-2 px-1 text-xs leading-relaxed text-subtle">
        博客是静态站，保存后需要重新构建才会更新。
      </p>
    </div>
  );
}
