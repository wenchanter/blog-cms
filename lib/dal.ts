import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/session";

/**
 * Data Access Layer. Every server-side read of "who is signed in" goes through
 * here, so authorization sits next to the data rather than in the UI or in
 * `proxy.ts` (which only does an optimistic cookie check).
 *
 * `cache` memoizes per render pass, so a page can call these freely without
 * re-querying D1.
 */

export const getCurrentUser = cache(
  async (): Promise<SessionUser | null> => getSessionUser(),
);

/** Returns the signed-in user, or redirects to the login page. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = returnTo
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    redirect(target);
  }
  return user;
}

/** Returns the signed-in user, or redirects unless they hold `role`. */
export async function requireRole(
  role: string,
  returnTo?: string,
): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (user.role !== role) redirect("/");
  return user;
}
