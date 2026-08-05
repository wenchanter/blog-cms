import { getAssetBucket } from "@/lib/cloudflare";
import { requireUser } from "@/lib/dal";

/**
 * Image upload for the article editor. Writes to the R2 `BLOG_ASSETS` bucket
 * and returns the public path that `/assets/<key>` serves.
 *
 * The intrinsic pixel size is measured in the browser and encoded into the
 * object key as `-<w>x<h>`, so the dimensions travel with the URL. The block
 * compiler reads them back out, letting the static site reserve space for the
 * image without any extra bookkeeping.
 */

export const dynamic = "force-dynamic";

/** Must match MAX_UPLOAD_BYTES in lib/upload-image.ts. */
const MAX_BYTES = 2 * 1024 * 1024;

/** Only formats a browser will render inline, keyed by their magic bytes. */
const ALLOWED = new Map<string, string>([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

/**
 * Trusts the bytes, not the declared Content-Type: a caller can claim any type,
 * so sniff the signature and refuse anything that is not really an image.
 */
function sniff(bytes: Uint8Array): string | null {
  const startsWith = (...sig: number[]) =>
    sig.every((byte, index) => bytes[index] === byte);

  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (startsWith(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (startsWith(0x47, 0x49, 0x46, 0x38)) return "image/gif";

  const brand = new TextDecoder().decode(bytes.slice(8, 12));
  if (startsWith(0x52, 0x49, 0x46, 0x46) && brand === "WEBP") return "image/webp";
  const ftyp = new TextDecoder().decode(bytes.slice(4, 8));
  if (ftyp === "ftyp" && brand.startsWith("avi")) return "image/avif";

  return null;
}

function clampDimension(value: FormDataEntryValue | null): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 20000) return null;
  return parsed;
}

export async function POST(request: Request): Promise<Response> {
  // Uploads write to a shared bucket, so this must never be open.
  await requireUser("/admin/posts");

  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "缺少文件。" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "文件为空。" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `图片不能超过 ${MAX_BYTES / 1024 / 1024}MB。` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = sniff(bytes);
  const extension = contentType ? ALLOWED.get(contentType) : undefined;

  if (!contentType || !extension) {
    return Response.json(
      { error: "只支持 PNG / JPEG / WebP / GIF / AVIF 图片。" },
      { status: 415 },
    );
  }

  const width = clampDimension(form.get("width"));
  const height = clampDimension(form.get("height"));
  const size = width && height ? `-${width}x${height}` : "";
  const key = `posts/${crypto.randomUUID()}${size}.${extension}`;

  const bucket = await getAssetBucket();
  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType,
      // Keys are content-addressed by UUID and never reused, so the bytes at a
      // given URL can never change.
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return Response.json({ url: `/assets/${key}`, width, height });
}
