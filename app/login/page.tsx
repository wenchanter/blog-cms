import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/app/components/ui";
import { getCurrentUser } from "@/lib/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "登录 · Blog CMS",
  // Keep the login screen out of search results.
  robots: { index: false, follow: false },
};

/** Reads the session cookie, so this page must never be cached or prerendered. */
export const dynamic = "force-dynamic";

function normalizeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/admin";
  }
  return raw;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = normalizeNext((await searchParams).next);

  if (await getCurrentUser()) redirect(next);

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      {/* Soft accent wash so the card sits on something rather than floating
          in a plain white void. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(60rem 30rem at 50% -10%, var(--accent-soft), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(40rem 24rem at 50% 30%, black, transparent 75%)",
        }}
      />

      <div className="w-full max-w-[26rem]">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-accent text-white shadow-raised">
            <svg viewBox="0 0 24 24" className="size-5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 19.5V5a2 2 0 012-2h11a2 2 0 012 2v14.5" />
              <path d="M4 19.5A1.5 1.5 0 015.5 18H19M8 7h7M8 11h7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            登录 Blog CMS
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            使用你的账号继续管理博客内容。
          </p>
        </div>

        <Card className="p-6 shadow-raised sm:p-7">
          <LoginForm next={next} />
        </Card>

        <p className="mt-6 text-center text-xs text-subtle">
          账号由管理员通过 <code className="font-mono">npm run user:create</code> 创建。
        </p>
      </div>
    </main>
  );
}
