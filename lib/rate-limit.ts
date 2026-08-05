import { getDatabase } from "@/lib/cloudflare";

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the current window expires. Only meaningful when blocked. */
  retryAfterSeconds: number;
};

/**
 * Fixed-window counter backed by D1. Failed sign-ins are counted; a successful
 * one clears the key. Keys are hashed so the table never stores raw emails or
 * addresses.
 */
async function hashKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const db = await getDatabase();
  const row = await db
    .prepare(`SELECT count, window_start FROM login_attempts WHERE key = ?`)
    .bind(await hashKey(key))
    .first<{ count: number; window_start: string }>();

  if (!row) return { allowed: true, retryAfterSeconds: 0 };

  const windowEnd = Date.parse(row.window_start) + windowMs;
  if (windowEnd <= Date.now()) return { allowed: true, retryAfterSeconds: 0 };

  if (row.count < limit) return { allowed: true, retryAfterSeconds: 0 };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000)),
  };
}

/** Records one failure, starting a fresh window if the previous one lapsed. */
export async function recordFailure(
  key: string,
  windowMs: number,
): Promise<void> {
  const db = await getDatabase();
  const hashed = await hashKey(key);
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  await db
    .prepare(
      `INSERT INTO login_attempts (key, count, window_start)
       VALUES (?, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN login_attempts.window_start <= ?
                      THEN 1
                      ELSE login_attempts.count + 1 END,
         window_start = CASE WHEN login_attempts.window_start <= ?
                             THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                             ELSE login_attempts.window_start END`,
    )
    .bind(hashed, cutoff, cutoff)
    .run();
}

export async function clearAttempts(key: string): Promise<void> {
  const db = await getDatabase();
  await db
    .prepare(`DELETE FROM login_attempts WHERE key = ?`)
    .bind(await hashKey(key))
    .run();
}
