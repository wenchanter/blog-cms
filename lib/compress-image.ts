/**
 * Browser-side image compression, run before upload.
 *
 * This uses the browser's own WebP encoder via `canvas.toBlob`, so it costs
 * nothing — no image service, no WASM codec, and no Worker CPU. The work
 * happens on the author's machine while they wait for the upload anyway.
 *
 * Quality is protected by three rules:
 *   1. Downscale before re-encoding. Cutting pixels the layout can never show
 *      saves far more bytes than lowering quality, and is visually free.
 *   2. Never upscale, and never touch an image already within budget.
 *   3. If the re-encode comes out larger than the original — common for small
 *      or flat graphics — keep the original bytes.
 */

/**
 * The article column is ~700 CSS px wide; 2400 covers a 3× display with room
 * to spare. Anything beyond that is bytes no reader will ever see.
 */
const MAX_DIMENSION = 2400;

/** Visually lossless for photographs in practice; well below the 0.8 range where WebP starts to show artefacts. */
const WEBP_QUALITY = 0.92;

/** Below this, re-encoding usually costs more bytes than it saves. */
const SKIP_BELOW_BYTES = 150 * 1024;

export type CompressResult = {
  file: File;
  width: number;
  height: number;
  /** True when the returned file is a re-encode rather than the original. */
  compressed: boolean;
  originalBytes: number;
};

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

export async function compressImage(file: File): Promise<CompressResult> {
  const originalBytes = file.size;

  // Animated GIFs would be flattened to a single frame by a canvas round-trip.
  if (file.type === "image/gif") {
    const bitmap = await decode(file);
    const size = bitmap
      ? { width: bitmap.width, height: bitmap.height }
      : { width: 0, height: 0 };
    bitmap?.close();
    return { file, ...size, compressed: false, originalBytes };
  }

  const bitmap = await decode(file);
  if (!bitmap) {
    // Unknown format: hand it through untouched and let the server reject it.
    return { file, width: 0, height: 0, compressed: false, originalBytes };
  }

  const { width: sourceWidth, height: sourceHeight } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const targetWidth = Math.round(sourceWidth * scale);
  const targetHeight = Math.round(sourceHeight * scale);

  // Already small enough in both bytes and pixels — leave it exactly as it is.
  if (scale === 1 && originalBytes <= SKIP_BELOW_BYTES) {
    bitmap.close();
    return {
      file,
      width: sourceWidth,
      height: sourceHeight,
      compressed: false,
      originalBytes,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return {
      file,
      width: sourceWidth,
      height: sourceHeight,
      compressed: false,
      originalBytes,
    };
  }

  // Best-quality downscaling filter the browser offers.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  // WebP rather than JPEG: it keeps the alpha channel that PNG screenshots and
  // logos rely on, and compresses better at the same perceived quality.
  const blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);

  if (!blob || (blob.size >= originalBytes && scale === 1)) {
    // The re-encode did not help and no pixels were dropped: keep the original.
    return {
      file,
      width: sourceWidth,
      height: sourceHeight,
      compressed: false,
      originalBytes,
    };
  }

  const name = file.name.replace(/\.[^./\\]+$/, "") || "image";
  return {
    file: new File([blob], `${name}.webp`, { type: "image/webp" }),
    width: targetWidth,
    height: targetHeight,
    compressed: true,
    originalBytes,
  };
}
