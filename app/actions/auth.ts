"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/cloudflare";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "@/lib/password";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/rate-limit";
import {
  createSession,
  destroySession,
  revokeExpiredSessions,
} from "@/lib/session";

/** `email` is echoed back only to refill the form; the password never is. */
export type LoginState = { error?: string; email?: string } | undefined;

/** One message for every failure mode, so the form never confirms an email exists. */
const GENERIC_ERROR = "Incorrect email or password.";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Per address+email — stops password guessing against one account. */
const PER_ACCOUNT_LIMIT = 5;
/** Per address — stops one client spraying many accounts. */
const PER_IP_LIMIT = 20;

const MAX_EMAIL_LENGTH = 254;
/** Bounds the PBKDF2 input so a huge body cannot be used to burn CPU. */
const MAX_PASSWORD_LENGTH = 200;

/**
 * Only same-origin, non-protocol-relative paths are honoured, so `?next=` can't
 * be used to bounce a freshly-authenticated user to an attacker's site.
 */
function safeRedirectTarget(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return "/admin";
  }
  return raw;
}

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = safeRedirectTarget(formData.get("next"));

  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !password ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return { error: GENERIC_ERROR, email };
  }

  const requestHeaders = await headers();
  const ip = requestHeaders.get("cf-connecting-ip") ?? "unknown";
  const userAgent = requestHeaders.get("user-agent");

  const ipKey = `login:ip:${ip}`;
  const accountKey = `login:account:${ip}:${email}`;

  const [ipLimit, accountLimit] = await Promise.all([
    checkRateLimit(ipKey, PER_IP_LIMIT, RATE_LIMIT_WINDOW_MS),
    checkRateLimit(accountKey, PER_ACCOUNT_LIMIT, RATE_LIMIT_WINDOW_MS),
  ]);

  if (!ipLimit.allowed || !accountLimit.allowed) {
    const wait = Math.max(ipLimit.retryAfterSeconds, accountLimit.retryAfterSeconds);
    return {
      error: `Too many attempts. Try again in ${Math.ceil(wait / 60)} minute(s).`,
      email,
    };
  }

  const db = await getDatabase();
  const user = await db
    .prepare(`SELECT id, password_hash FROM users WHERE email = ?`)
    .bind(email)
    .first<{ id: number; password_hash: string }>();

  // Hash against a dummy record when the account is unknown, so both branches
  // cost the same wall-clock time and cannot be told apart.
  const valid = await verifyPassword(
    password,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !valid) {
    await Promise.all([
      recordFailure(ipKey, RATE_LIMIT_WINDOW_MS),
      recordFailure(accountKey, RATE_LIMIT_WINDOW_MS),
    ]);
    return { error: GENERIC_ERROR, email };
  }

  // Upgrade the stored hash if it predates the current cost parameters.
  if (needsRehash(user.password_hash)) {
    await db
      .prepare(
        `UPDATE users
            SET password_hash = ?,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?`,
      )
      .bind(await hashPassword(password), user.id)
      .run();
  }

  await clearAttempts(accountKey);
  await revokeExpiredSessions();
  // A brand-new token is minted here, so any pre-set cookie value is discarded
  // (session fixation).
  await createSession(user.id, { userAgent, ip });

  // `redirect` throws to unwind — must stay outside any try/catch.
  redirect(next);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
