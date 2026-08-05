import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDatabase(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

export async function getAssetBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.BLOG_ASSETS;
}

/**
 * Reads a Worker secret or plain variable, falling back to `process.env` so the
 * same call works under `next dev` (where `.dev.vars` is loaded differently).
 */
export async function readEnv(name: string): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const value = (env as unknown as Record<string, unknown>)[name];
    return (typeof value === "string" ? value : undefined) ?? process.env[name];
  } catch {
    return process.env[name];
  }
}
