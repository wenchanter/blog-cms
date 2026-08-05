import { cookies } from "next/headers";
import { getDatabase } from "@/lib/cloudflare";

export const SESSION_COOKIE = "session";

/** Absolute session lifetime. Sessions are not silently extended. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** How stale `last_used_at` may get before we bother writing it again. */
const LAST_USED_REFRESH_MS = 60 * 60 * 1000;

const TOKEN_BYTES = 32;

export type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  role: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The cookie carries a random token; the database stores only its SHA-256.
 * A read-only leak of the sessions table therefore yields nothing replayable.
 */
async function tokenToId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSession(
  userId: number,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<void> {
  const token = base64UrlEncode(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
  const id = await tokenToId(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const db = await getDatabase();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      expiresAt.toISOString(),
      meta.userAgent?.slice(0, 255) ?? null,
      meta.ip ?? null,
    )
    .run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from client-side JS, so XSS cannot exfiltrate it
    secure: process.env.NODE_ENV === "production", // http on localhost still works
    sameSite: "lax", // not sent on cross-site POSTs
    path: "/",
    expires: expiresAt,
  });
}

/**
 * Resolves the session cookie against the database. Returns `null` for
 * missing, unknown, or expired sessions.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = await tokenToId(token);
  const db = await getDatabase();

  const row = await db
    .prepare(
      `SELECT s.id          AS session_id,
              s.expires_at  AS expires_at,
              s.last_used_at AS last_used_at,
              u.id          AS user_id,
              u.email       AS email,
              u.name        AS name,
              u.role        AS role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .bind(id)
    .first<{
      session_id: string;
      expires_at: string;
      last_used_at: string;
      user_id: number;
      email: string;
      name: string | null;
      role: string;
    }>();

  if (!row) return null;

  if (Date.parse(row.expires_at) <= Date.now()) {
    await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(id).run();
    return null;
  }

  if (Date.now() - Date.parse(row.last_used_at) > LAST_USED_REFRESH_MS) {
    await db
      .prepare(
        `UPDATE sessions
            SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ?`,
      )
      .bind(id)
      .run();
  }

  return {
    id: row.user_id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

/** Revokes the current session server-side and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    const db = await getDatabase();
    await db
      .prepare(`DELETE FROM sessions WHERE id = ?`)
      .bind(await tokenToId(token))
      .run();
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Drops every other session for a user — used to rotate on sign-in. */
export async function revokeExpiredSessions(): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(
      `DELETE FROM sessions
        WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .run();
}
