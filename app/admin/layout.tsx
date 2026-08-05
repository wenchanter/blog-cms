import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Button, IconPlus, LinkButton } from "@/app/components/ui";
import { requireUser } from "@/lib/dal";
import { AdminNav } from "./nav";
import { DeployButton } from "./deploy-button";

export const dynamic = "force-dynamic";

/** First letter of the display name, used for the avatar chip. */
function initial(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "?";
}

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Guards every /admin/* route; individual pages re-check via the DAL too.
  const user = await requireUser("/admin");
  const label = user.name ?? user.email;

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-line bg-panel lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-6 p-4 lg:p-5">
          <Link
            href="/admin"
            className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-[15px] font-semibold tracking-tight text-ink"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-white">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 19.5V5a2 2 0 012-2h11a2 2 0 012 2v14.5" />
                <path d="M4 19.5A1.5 1.5 0 015.5 18H19" />
              </svg>
            </span>
            Blog CMS
          </Link>

          <AdminNav />

          <LinkButton
            href="/admin/posts/new"
            variant="primary"
            size="md"
            className="w-full"
          >
            <IconPlus />
            新建文章
          </LinkButton>

          <div className="mt-auto">
            <DeployButton />
          </div>

          <div className="border-t border-line pt-4">
            <div className="mb-3 flex items-center gap-2.5 px-1">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-text">
                {initial(label)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-ink">
                  {label}
                </span>
                <span className="block truncate text-xs text-subtle">
                  {user.role}
                </span>
              </span>
            </div>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
                退出登录
              </Button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
          {children}
        </div>
      </div>
    </div>
  );
}
