import { compressImage } from "@/lib/compress-image";

/**
 * Browser-side upload used by the editor's image button.
 *
 * The file is downscaled and re-encoded before it leaves the browser (see
 * `compress-image.ts`), and the resulting intrinsic size is sent along so the
 * server can encode it into the object key. Measuring here avoids having to
 * decode image headers on the Worker.
 */

/** Must match MAX_BYTES in app/api/upload/route.ts. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/**
 * The cap on what the author may *pick*. Compression usually brings a large
 * photo well under the stored limit, so rejecting at selection size would turn
 * away files that would have been fine.
 */
export const MAX_SELECT_BYTES = 20 * 1024 * 1024;

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export async function uploadImage(
  file: File,
  onProgress?: (event: { progress: number }) => void,
  abortSignal?: AbortSignal,
): Promise<string> {
  if (!file) throw new Error("没有选择文件。");

  if (file.size > MAX_SELECT_BYTES) {
    throw new Error(
      `图片过大（${megabytes(file.size)}），请先压缩到 ${megabytes(MAX_SELECT_BYTES)} 以内。`,
    );
  }

  onProgress?.({ progress: 10 });
  const { file: prepared, width, height, compressed, originalBytes } =
    await compressImage(file);
  onProgress?.({ progress: 40 });

  if (prepared.size > MAX_UPLOAD_BYTES) {
    const detail = compressed
      ? `压缩后仍有 ${megabytes(prepared.size)}`
      : `${megabytes(originalBytes)}`;
    throw new Error(
      `图片超过 ${megabytes(MAX_UPLOAD_BYTES)} 上限（${detail}），请换一张或先手动压缩。`,
    );
  }

  const body = new FormData();
  body.set("file", prepared);
  if (width && height) {
    body.set("width", String(width));
    body.set("height", String(height));
  }

  const response = await fetch("/api/upload", {
    method: "POST",
    body,
    signal: abortSignal,
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((data) => (data as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail ?? `上传失败（${response.status}）。`);
  }

  const { url } = (await response.json()) as { url: string };
  onProgress?.({ progress: 100 });
  return url;
}
