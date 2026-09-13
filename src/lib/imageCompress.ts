/**
 * Client-side image compression for Teacher Page uploads (Phase 1.3).
 * Gallery photos come straight off phones at 3-8 MB; storage and mobile
 * bandwidth need ~200 KB. Canvas downscale keeps the long edge at 1600px and
 * re-encodes as JPEG quality 0.8 — a WebP/PNG input becomes a JPEG, EXIF
 * orientation is respected by the browser's <img>/createImageBitmap decode.
 *
 * Falls back to the original file when the browser cannot decode it (rare,
 * e.g. exotic formats) so the upload flow never hard-fails here.
 */

export const MAX_IMAGE_LONG_EDGE = 1600;
export const JPEG_QUALITY = 0.8;

export interface CompressResult {
  blob: Blob;
  /** Downscaled dimensions (may be the original's when no scale was needed). */
  width: number;
  height: number;
}

export const compressImage = async (file: File): Promise<CompressResult> => {
  // Bitmap decode handles EXIF orientation + is faster than <img> on phones.
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  if (bitmap) {
    const scale = Math.min(1, MAX_IMAGE_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const blob = await encodeBitmap(bitmap, width, height).catch(() => null);
    bitmap.close();
    if (blob) return { blob, width, height };
    // Decoding worked but canvas encoding failed — try the <img> path,
    // then give up gracefully by passing the original through.
    const viaImg = await compressViaImgElement(file);
    return viaImg ?? { blob: file, width: 0, height: 0 };
  }

  // <img> fallback for browsers without createImageBitmap(file).
  const viaImg = await compressViaImgElement(file);
  if (viaImg) return viaImg;

  // Undecodable — upload as-is (server caps still apply).
  return { blob: file, width: 0, height: 0 };
};

const encodeBitmap = async (
  bitmap: ImageBitmap,
  width: number,
  height: number,
): Promise<Blob | null> => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise<Blob | null>(resolve => {
    canvas.toBlob(blob => resolve(blob), 'image/jpeg', JPEG_QUALITY);
  });
};

const compressViaImgElement = async (file: File): Promise<CompressResult | null> => {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('decode failed'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY);
    });
    return blob ? { blob, width, height } : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
};
