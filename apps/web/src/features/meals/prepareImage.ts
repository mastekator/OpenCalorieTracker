/** The file isn't an image the browser can decode (dialog 3.8, E-1.1). */
export class ImageDecodeError extends Error {
  constructor() {
    super('image_decode');
  }
}

export const MAX_SIDE = 1280;

/** Scales (w, h) so the long side is at most `max`; never upscales. */
export function fitSize(w: number, h: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * Photo → JPEG q0.8 with the long side ≤ 1280 px (ADR-0008 "Client").
 * Orientation is applied before drawing; re-encoding drops EXIF and GPS (AC-1.4).
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageDecodeError();
  }
  try {
    const { width, height } = fitSize(bitmap.width, bitmap.height);
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
      return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new ImageDecodeError())),
        'image/jpeg',
        0.8,
      ),
    );
  } finally {
    bitmap.close();
  }
}
