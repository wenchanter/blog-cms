import { getAssetBucket } from "@/lib/cloudflare";

/**
 * Public read path for uploaded images.
 *
 * Article images are published content, so this route is intentionally
 * unauthenticated — the static site references these URLs directly and is
 * built without credentials. Keys are random UUIDs, so nothing is enumerable.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/assets/[...key]">,
): Promise<Response> {
  const { key } = await params;
  const objectKey = key.join("/");

  // Uploads only ever write under `posts/`; refuse anything else so this
  // cannot be used to read other objects in the bucket.
  if (!objectKey.startsWith("posts/") || objectKey.includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  const bucket = await getAssetBucket();
  const object = await bucket.get(objectKey);

  if (!object) return new Response("Not found", { status: 404 });

  // Headers are assembled by hand rather than via `writeHttpMetadata`: that
  // method takes a `Headers` instance, which cannot cross the local dev
  // platform proxy.
  const headers = new Headers({
    "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    ETag: object.httpEtag,
  });

  // Buffered rather than streamed: uploads are capped at 5MB, and the R2 body
  // stream cannot cross that proxy either.
  return new Response(await object.arrayBuffer(), { headers });
}
