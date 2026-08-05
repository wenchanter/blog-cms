import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getDatabase(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}

export async function getAssetBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext({ async: true });
  return env.BLOG_ASSETS;
}
